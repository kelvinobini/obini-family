import "server-only";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError } from "@/lib/api";
import { recordAudit, type AuditActor } from "@/lib/audit";
import type { z } from "zod";
import type {
  parentChildInput,
  personInput,
  siblingInput,
  unionInput,
} from "@/lib/validation";

/**
 * Structural writes to the tree, in one place.
 *
 * Both the admin API and the review queue's "approve" button end up here, so
 * a relationship created directly and a relationship created by approving a
 * member's suggestion are written and audited identically.
 */

type UnionData = z.infer<typeof unionInput>;
type ParentChildData = z.infer<typeof parentChildInput>;
type SiblingData = z.infer<typeof siblingInput>;
type PersonData = z.infer<typeof personInput>;

async function nameOf(id: string): Promise<string> {
  const p = await db.person.findUnique({
    where: { id },
    select: { legalName: true },
  });
  if (!p) throw new NotFoundError("We couldn't find that person in the tree.");
  return p.legalName;
}

export async function createPersonRecord(
  input: PersonData,
  actor: AuditActor,
  opts: { recordedById?: string | null; verified?: boolean } = {}
) {
  const person = await db.person.create({
    data: {
      ...input,
      titles: input.titles ?? [],
      languages: input.languages ?? [],
      recordedById: opts.recordedById ?? null,
      verification: opts.verified ? "VERIFIED" : "UNVERIFIED",
      ...(opts.verified
        ? { lastVerifiedById: opts.recordedById ?? null, lastVerifiedAt: new Date() }
        : {}),
    },
  });

  await recordAudit({
    actor,
    action: "CREATE",
    entityType: "Person",
    entityId: person.id,
    entityLabel: person.legalName,
    newValue: { legalName: person.legalName },
  });

  return person;
}

export async function createUnionRecord(input: UnionData, actor: AuditActor) {
  const [aName, bName] = await Promise.all([
    nameOf(input.partnerAId),
    nameOf(input.partnerBId),
  ]);

  const duplicate = await db.union.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { partnerAId: input.partnerAId, partnerBId: input.partnerBId },
        { partnerAId: input.partnerBId, partnerBId: input.partnerAId },
      ],
      startDate: input.startDate ?? null,
    },
  });
  if (duplicate) {
    throw new ConflictError(`${aName} and ${bName} are already recorded as married.`);
  }

  // A marriage that has ended is not the current one, whatever the form said.
  const isCurrent = input.endReason ? false : (input.isCurrent ?? true);

  const union = await db.union.create({
    data: {
      partnerAId: input.partnerAId,
      partnerBId: input.partnerBId,
      type: input.type ?? "MARRIAGE",
      startDate: input.startDate ?? null,
      startPrecision: input.startPrecision ?? "UNKNOWN",
      startDateText: input.startDateText ?? null,
      place: input.place ?? null,
      endDate: input.endDate ?? null,
      endReason: input.endReason ?? null,
      isCurrent,
      householdOrder: input.householdOrder ?? null,
      notes: input.notes ?? null,
    },
  });

  await recordAudit({
    actor,
    action: "LINK",
    entityType: "Union",
    entityId: union.id,
    entityLabel: `${aName} & ${bName}`,
    newValue: {
      partnerAId: input.partnerAId,
      partnerBId: input.partnerBId,
      type: union.type,
      endReason: union.endReason,
    },
  });

  return union;
}

export async function createParentChildRecord(
  input: ParentChildData,
  actor: AuditActor
) {
  const [parentName, childName] = await Promise.all([
    nameOf(input.parentId),
    nameOf(input.childId),
  ]);

  // A child cannot be their own ancestor. Walk up from the proposed parent and
  // refuse if we run into the child — without this one bad link makes the tree
  // renderer loop forever.
  if (await isAncestorOf(input.childId, input.parentId)) {
    throw new ConflictError(
      `That would make ${childName} their own ancestor. Check which way round the link should go.`
    );
  }

  const duplicate = await db.parentChild.findFirst({
    where: {
      parentId: input.parentId,
      childId: input.childId,
      type: input.type ?? "BIOLOGICAL",
      deletedAt: null,
    },
  });
  if (duplicate) {
    throw new ConflictError(
      `${parentName} is already recorded as ${childName}'s parent.`
    );
  }

  const edge = await db.parentChild.create({
    data: {
      parentId: input.parentId,
      childId: input.childId,
      type: input.type ?? "BIOLOGICAL",
      unionId: input.unionId ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      notes: input.notes ?? null,
    },
  });

  await recordAudit({
    actor,
    action: "LINK",
    entityType: "ParentChild",
    entityId: edge.id,
    entityLabel: `${parentName} → ${childName}`,
    newValue: { parentId: input.parentId, childId: input.childId, type: edge.type },
  });

  return edge;
}

export async function createSiblingRecord(input: SiblingData, actor: AuditActor) {
  const [aName, bName] = await Promise.all([nameOf(input.aId), nameOf(input.bId)]);

  const duplicate = await db.siblingLink.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { aId: input.aId, bId: input.bId },
        { aId: input.bId, bId: input.aId },
      ],
    },
  });
  if (duplicate) {
    throw new ConflictError(`${aName} and ${bName} are already linked as siblings.`);
  }

  const link = await db.siblingLink.create({
    data: {
      aId: input.aId,
      bId: input.bId,
      type: input.type ?? "UNKNOWN",
      notes: input.notes ?? null,
    },
  });

  await recordAudit({
    actor,
    action: "LINK",
    entityType: "SiblingLink",
    entityId: link.id,
    entityLabel: `${aName} & ${bName}`,
    newValue: { aId: input.aId, bId: input.bId, type: link.type },
  });

  return link;
}

/** Depth-limited walk upward, guarding against cycles already in the data. */
async function isAncestorOf(
  candidateAncestorId: string,
  personId: string,
  maxDepth = 20
): Promise<boolean> {
  let frontier = [personId];
  const seen = new Set(frontier);

  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const edges = await db.parentChild.findMany({
      where: { childId: { in: frontier }, deletedAt: null },
      select: { parentId: true },
    });
    const next: string[] = [];
    for (const e of edges) {
      if (e.parentId === candidateAncestorId) return true;
      if (seen.has(e.parentId)) continue;
      seen.add(e.parentId);
      next.push(e.parentId);
    }
    frontier = next;
  }
  return false;
}

const DELEGATES = {
  UNION: "union",
  PARENT_CHILD: "parentChild",
  SIBLING: "siblingLink",
} as const;

export type RelationshipKind = keyof typeof DELEGATES;

export async function removeRelationship(
  kind: RelationshipKind,
  id: string,
  actor: AuditActor
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = db[DELEGATES[kind]] as any;
  const existing = await model.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    throw new NotFoundError("That connection has already been removed.");
  }

  await model.update({ where: { id }, data: { deletedAt: new Date() } });

  await recordAudit({
    actor,
    action: "UNLINK",
    entityType:
      kind === "UNION" ? "Union" : kind === "PARENT_CHILD" ? "ParentChild" : "SiblingLink",
    entityId: id,
    entityLabel: null,
    oldValue: { deletedAt: null },
    newValue: { deletedAt: new Date().toISOString() },
  });
}
