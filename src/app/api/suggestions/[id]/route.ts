import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, NotFoundError, ConflictError } from "@/lib/api";
import { getActor, clientIp } from "@/lib/auth";
import { assertRole } from "@/lib/authz";
import { reviewInput, personInput, parentChildInput, unionInput, siblingInput } from "@/lib/validation";
import { recordAudit, recordFieldChanges, type AuditActor } from "@/lib/audit";
import {
  createParentChildRecord,
  createPersonRecord,
  createSiblingRecord,
  createUnionRecord,
} from "@/lib/relationship-writes";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Approve or reject one submission.
 *
 * Approving is the only path by which a member's or a contributor's proposal
 * reaches the family record, and it goes through exactly the same write
 * functions — and the same audit trail — as an admin typing it in directly.
 */
export const POST = handler(async (req: NextRequest, ctx: Ctx) => {
  const actor = await getActor();
  assertRole(actor, "suggestion:review");
  const { id } = await ctx.params;

  const { decision, reviewNote } = reviewInput.parse(await req.json());

  const suggestion = await db.suggestion.findUnique({
    where: { id },
    include: { media: true, viaLink: { select: { label: true } } },
  });
  if (!suggestion) throw new NotFoundError("That suggestion no longer exists.");
  if (suggestion.status !== "PENDING") {
    throw new ConflictError("That suggestion has already been reviewed.");
  }

  const auditActor: AuditActor = { kind: "user", user: actor };
  const payload = (suggestion.payload ?? {}) as Record<string, unknown>;
  let outcome = "";

  if (decision === "REJECT") {
    await db.suggestion.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewNote: reviewNote ?? null,
      },
    });
    // Anything uploaded alongside a rejected suggestion goes with it.
    await db.media.updateMany({
      where: { suggestionId: id },
      data: { deletedAt: new Date() },
    });

    await recordAudit({
      actor: auditActor,
      action: "REJECT",
      entityType: "Suggestion",
      entityId: id,
      entityLabel: suggestion.kind,
      ip: clientIp(req.headers),
    });

    return ok({ ok: true, message: "Turned down, and the person who sent it can try again." });
  }

  // --- Approve -------------------------------------------------------------
  switch (suggestion.kind) {
    case "FIELD_EDIT": {
      if (!suggestion.targetPersonId) {
        throw new ConflictError("That suggestion isn't attached to anyone.");
      }
      const before = await db.person.findFirst({
        where: { id: suggestion.targetPersonId, deletedAt: null },
      });
      if (!before) throw new NotFoundError("That person is no longer in the tree.");

      const fields = personInput.partial().parse(payload);
      const data = stripUndefined(fields);

      const after = await db.person.update({
        where: { id: before.id },
        data: {
          ...data,
          lastVerifiedById: actor.id,
          lastVerifiedAt: new Date(),
          verification: "VERIFIED",
        },
      });

      await recordFieldChanges({
        actor: auditActor,
        entityType: "Person",
        entityId: after.id,
        entityLabel: after.legalName,
        before: before as unknown as Record<string, unknown>,
        after: data,
        ip: clientIp(req.headers),
      });

      outcome = `Applied to ${after.legalName}.`;
      break;
    }

    case "NEW_PERSON": {
      const personFields = personInput.parse(payload.person ?? payload);
      const person = await createPersonRecord(personFields, auditActor, {
        recordedById: suggestion.submittedById,
        // A submission that has just been read and approved by an admin is
        // verified; one that arrived from an unknown contributor is not.
        verified: !!suggestion.submittedById,
      });

      // Attach any photos that rode in with the submission.
      if (suggestion.media.length) {
        await db.media.updateMany({
          where: { suggestionId: id },
          data: { personId: person.id, suggestionId: null },
        });
      }

      // Relatives the contributor named. We record them as unverified
      // placeholders and link them, rather than throwing the names away.
      const relatives = (payload.relatives ?? []) as {
        name: string;
        relation: "FATHER" | "MOTHER" | "SPOUSE" | "CHILD";
      }[];

      for (const relative of relatives) {
        if (!relative?.name?.trim()) continue;
        const existing = await db.person.findFirst({
          where: { legalName: relative.name.trim(), deletedAt: null },
        });
        const other =
          existing ??
          (await createPersonRecord(
            {
              legalName: relative.name.trim(),
              gender:
                relative.relation === "FATHER"
                  ? "MALE"
                  : relative.relation === "MOTHER"
                    ? "FEMALE"
                    : "UNKNOWN",
            } as never,
            auditActor,
            { verified: false }
          ));

        if (relative.relation === "FATHER" || relative.relation === "MOTHER") {
          await createParentChildRecord(
            { parentId: other.id, childId: person.id, type: "BIOLOGICAL" } as never,
            auditActor
          ).catch(() => {});
        } else if (relative.relation === "CHILD") {
          await createParentChildRecord(
            { parentId: person.id, childId: other.id, type: "BIOLOGICAL" } as never,
            auditActor
          ).catch(() => {});
        } else if (relative.relation === "SPOUSE") {
          await createUnionRecord(
            { partnerAId: person.id, partnerBId: other.id, type: "MARRIAGE" } as never,
            auditActor
          ).catch(() => {});
        }
      }

      outcome = `${person.legalName} is now in the tree.`;
      break;
    }

    case "NEW_RELATIONSHIP": {
      const kind = payload.kind as "UNION" | "PARENT_CHILD" | "SIBLING";
      if (kind === "UNION") {
        await createUnionRecord(unionInput.parse(payload), auditActor);
      } else if (kind === "PARENT_CHILD") {
        await createParentChildRecord(parentChildInput.parse(payload), auditActor);
      } else {
        await createSiblingRecord(siblingInput.parse(payload), auditActor);
      }
      outcome = "The connection has been added to the tree.";
      break;
    }

    case "MEDIA": {
      await db.media.updateMany({
        where: { suggestionId: id },
        data: { personId: suggestion.targetPersonId, suggestionId: null },
      });
      outcome = "The photos are on the profile now.";
      break;
    }

    case "DELETE_REQUEST": {
      if (!suggestion.targetPersonId) {
        throw new ConflictError("That request isn't attached to anyone.");
      }
      const person = await db.person.update({
        where: { id: suggestion.targetPersonId },
        data: { deletedAt: new Date() },
      });
      await recordAudit({
        actor: auditActor,
        action: "DELETE",
        entityType: "Person",
        entityId: person.id,
        entityLabel: person.legalName,
        oldValue: { deletedAt: null },
        newValue: { deletedAt: new Date().toISOString() },
      });
      outcome = `${person.legalName} has been removed, recoverably.`;
      break;
    }

    case "REMOVAL_REQUEST": {
      // Honouring a data-removal request: the person's details go, their place
      // in the family stays, so nobody else's tree breaks.
      if (!suggestion.targetPersonId) {
        throw new ConflictError("That request isn't attached to anyone.");
      }
      const before = await db.person.findUniqueOrThrow({
        where: { id: suggestion.targetPersonId },
      });
      const after = await db.person.update({
        where: { id: before.id },
        data: {
          nameOnly: true,
          removalRequestedAt: before.removalRequestedAt ?? new Date(),
          phone: null,
          email: null,
          whatsapp: null,
          cityOfResidence: null,
          lifeStory: null,
          privacyLevel: "LIMITED",
        },
      });
      await db.media.updateMany({
        where: { personId: before.id },
        data: { deletedAt: new Date() },
      });
      await recordFieldChanges({
        actor: auditActor,
        entityType: "Person",
        entityId: after.id,
        entityLabel: after.legalName,
        before: before as unknown as Record<string, unknown>,
        after: { nameOnly: true, privacyLevel: "LIMITED" },
      });
      outcome = `${after.legalName}'s details have been removed. Their place in the family remains.`;
      break;
    }
  }

  await db.suggestion.update({
    where: { id },
    data: {
      status: "APPROVED",
      reviewedById: actor.id,
      reviewedAt: new Date(),
      reviewNote: reviewNote ?? null,
    },
  });

  await recordAudit({
    actor: auditActor,
    action: "APPROVE",
    entityType: "Suggestion",
    entityId: id,
    entityLabel: suggestion.kind,
    ip: clientIp(req.headers),
  });

  return ok({ ok: true, message: outcome });
});

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}
