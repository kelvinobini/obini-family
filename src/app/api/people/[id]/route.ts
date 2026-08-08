import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, NotFoundError } from "@/lib/api";
import { getActor, clientIp } from "@/lib/auth";
import {
  assertCanEditPerson,
  assertRole,
  canChangePrivacy,
  canEditPerson,
} from "@/lib/authz";
import { personInput, privacyInput } from "@/lib/validation";
import { recordAudit, recordFieldChanges } from "@/lib/audit";
import { audienceFor, redactPerson } from "@/lib/privacy";
import { getSettings } from "@/lib/settings";
import { AuthError } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: NextRequest, ctx: Ctx) => {
  const actor = await getActor();
  if (!actor) throw new AuthError("Not signed in", 401);
  const { id } = await ctx.params;

  const person = await db.person.findFirst({ where: { id, deletedAt: null } });
  if (!person) throw new NotFoundError("We couldn't find that person.");

  const settings = await getSettings();
  const canEdit = await canEditPerson(actor, id);
  const audience = audienceFor({ role: actor.role, canEdit });

  return ok({ person: redactPerson(person, audience, settings), canEdit });
});

/**
 * The gate. A member may write here only for themselves, their minor children
 * and the relatives an admin made them steward of. Anyone else gets a 403 —
 * from this function, on the server, whether or not the UI ever showed them a
 * form.
 */
export const PATCH = handler(async (req: NextRequest, ctx: Ctx) => {
  const actor = await getActor();
  const { id } = await ctx.params;

  await assertCanEditPerson(actor, id);

  const before = await db.person.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw new NotFoundError("We couldn't find that person.");

  const body = await req.json();
  const fields = personInput.partial().parse(body);

  // Privacy is the subject's own decision, so it travels on the same request
  // but through a stricter check — a steward maintaining a record cannot use
  // it to hide someone else away.
  const privacy = privacyInput.parse(body);
  const privacyData: Record<string, unknown> = {};
  if (privacy.privacyLevel !== undefined || privacy.fieldPrivacy !== undefined) {
    if (!canChangePrivacy(actor!, id)) {
      throw new AuthError(
        "Only this person, or an admin, can change their privacy settings.",
        403
      );
    }
    if (privacy.privacyLevel !== undefined) privacyData.privacyLevel = privacy.privacyLevel;
    if (privacy.fieldPrivacy !== undefined) privacyData.fieldPrivacy = privacy.fieldPrivacy;
  }

  const data = { ...stripUndefined(fields), ...privacyData };
  if (Object.keys(data).length === 0) {
    return ok({ ok: true, changed: 0, message: "Nothing to change." });
  }

  const after = await db.person.update({
    where: { id },
    data: {
      ...data,
      lastVerifiedById: actor!.id,
      lastVerifiedAt: new Date(),
      // A person speaking for their own record is the strongest verification
      // we can have.
      ...(actor!.personId === id ? { verification: "VERIFIED" as const } : {}),
    },
  });

  const changed = await recordFieldChanges({
    actor: { kind: "user", user: actor! },
    entityType: "Person",
    entityId: id,
    entityLabel: after.legalName,
    before: before as unknown as Record<string, unknown>,
    after: data,
    ip: clientIp(req.headers),
    userAgent: req.headers.get("user-agent"),
  });

  const settings = await getSettings();
  return ok({
    ok: true,
    changed,
    person: redactPerson(after, "EDITOR", settings),
  });
});

/** Soft delete, admin only, recoverable for the configured window. */
export const DELETE = handler(async (req: NextRequest, ctx: Ctx) => {
  const actor = await getActor();
  assertRole(actor, "person:delete");
  const { id } = await ctx.params;

  const person = await db.person.findFirst({ where: { id, deletedAt: null } });
  if (!person) throw new NotFoundError("We couldn't find that person.");

  const settings = await getSettings();

  await db.person.update({ where: { id }, data: { deletedAt: new Date() } });

  await recordAudit({
    actor: { kind: "user", user: actor },
    action: "DELETE",
    entityType: "Person",
    entityId: id,
    entityLabel: person.legalName,
    oldValue: { deletedAt: null },
    newValue: { deletedAt: new Date().toISOString() },
    ip: clientIp(req.headers),
  });

  return ok({
    ok: true,
    message:
      `${person.legalName} has been removed from the tree. ` +
      `You can bring them back within ${settings.softDeleteWindowDays} days.`,
  });
});

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}
