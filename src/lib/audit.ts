import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { AuditAction } from "@prisma/client";
import type { Actor } from "@/lib/auth";

/**
 * ---------------------------------------------------------------------------
 * Every change to the family record is written here — who, which field, what
 * it was, what it became, when. One row per field, which is what makes a
 * single change individually reversible instead of forcing an all-or-nothing
 * restore of a whole record.
 * ---------------------------------------------------------------------------
 */

export type AuditActor =
  | { kind: "user"; user: Pick<Actor, "id" | "name"> }
  /** A no-account contributor acting through a single-use link. */
  | { kind: "link"; label: string }
  | { kind: "system"; label: string };

function actorFields(actor: AuditActor) {
  if (actor.kind === "user") {
    return { actorUserId: actor.user.id, actorLabel: actor.user.name };
  }
  if (actor.kind === "link") {
    return { actorUserId: null, actorLabel: `Contributor link: ${actor.label}` };
  }
  return { actorUserId: null, actorLabel: actor.label };
}

export async function recordAudit(opts: {
  actor: AuditActor;
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityLabel?: string | null;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  tx?: Prisma.TransactionClient;
}) {
  const client = opts.tx ?? db;
  return client.auditLog.create({
    data: {
      ...actorFields(opts.actor),
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      entityLabel: opts.entityLabel ?? null,
      field: opts.field ?? null,
      oldValue: toJson(opts.oldValue),
      newValue: toJson(opts.newValue),
      ip: opts.ip ?? null,
      userAgent: opts.userAgent?.slice(0, 300) ?? null,
    },
  });
}

/**
 * Diffs a record before and after an update and writes one entry per field
 * that actually moved. Fields that were submitted unchanged produce nothing,
 * so the activity log stays readable.
 */
export async function recordFieldChanges(opts: {
  actor: AuditActor;
  entityType: string;
  entityId: string;
  entityLabel?: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
  tx?: Prisma.TransactionClient;
}): Promise<number> {
  const client = opts.tx ?? db;
  const rows: Prisma.AuditLogCreateManyInput[] = [];
  const base = actorFields(opts.actor);

  for (const field of Object.keys(opts.after)) {
    if (IGNORED_FIELDS.has(field)) continue;
    const before = opts.before[field];
    const after = opts.after[field];
    if (equivalent(before, after)) continue;

    rows.push({
      ...base,
      action: "UPDATE",
      entityType: opts.entityType,
      entityId: opts.entityId,
      entityLabel: opts.entityLabel ?? null,
      field,
      oldValue: toJson(before),
      newValue: toJson(after),
      ip: opts.ip ?? null,
      userAgent: opts.userAgent?.slice(0, 300) ?? null,
    });
  }

  if (rows.length === 0) return 0;
  await client.auditLog.createMany({ data: rows });
  return rows.length;
}

const IGNORED_FIELDS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "lastVerifiedAt",
  "lastVerifiedById",
]);

function equivalent(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date || b instanceof Date) {
    return normaliseDate(a) === normaliseDate(b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => equivalent(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  // "" and null both mean "we don't know this" in a family record.
  if ((a === "" && b === null) || (a === null && b === "")) return true;
  return false;
}

function normaliseDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toISOString();
  }
  return null;
}

/**
 * A null we recorded is a real fact ("this field was empty before"), so it is
 * stored as a JSON null rather than as SQL NULL — otherwise a rollback could
 * not tell "was blank" from "was never logged".
 */
function toJson(value: unknown): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  if (value instanceof Date) return value.toISOString();
  return value as Prisma.InputJsonValue;
}

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------

/**
 * Values come back out of JSON as strings. Before writing one back to a typed
 * column we have to restore its shape, so a rolled-back birthDate is a Date
 * again and not the string "1948-03-02T00:00:00.000Z".
 */
const DATE_FIELDS = new Set([
  "birthDate",
  "deathDate",
  "startDate",
  "endDate",
  "takenAt",
  "happenedAt",
  "date",
  "deletedAt",
  "expiresAt",
  "removalRequestedAt",
]);
const INT_FIELDS = new Set([
  "birthOrder",
  "siblingCount",
  "householdOrder",
  "approxYear",
  "sizeBytes",
  "width",
  "height",
  "durationSec",
]);

function coerce(field: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (DATE_FIELDS.has(field)) return new Date(value as string);
  if (INT_FIELDS.has(field)) return Number(value);
  return value;
}

const DELEGATES: Record<string, keyof typeof db> = {
  Person: "person",
  Union: "union",
  ParentChild: "parentChild",
  SiblingLink: "siblingLink",
  Milestone: "milestone",
  Story: "story",
  Media: "media",
  Event: "event",
  Comment: "comment",
  Settings: "settings",
};

export type RollbackResult = {
  ok: boolean;
  message: string;
};

/**
 * Reverses one logged change. Field updates are written back to their old
 * value; a creation is soft-deleted; a deletion is restored. The rollback
 * itself is logged, so undoing is as visible as doing.
 */
export async function rollbackAudit(
  auditId: string,
  admin: Pick<Actor, "id" | "name">
): Promise<RollbackResult> {
  const entry = await db.auditLog.findUnique({ where: { id: auditId } });
  if (!entry) return { ok: false, message: "That change no longer exists." };
  if (entry.rolledBackAt) {
    return { ok: false, message: "That change has already been undone." };
  }

  const delegateName = DELEGATES[entry.entityType];
  if (!delegateName) {
    return {
      ok: false,
      message: `${entry.entityType} changes can't be undone automatically.`,
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = db[delegateName] as any;

  let description = "";

  if (entry.action === "UPDATE" && entry.field) {
    const value = coerce(entry.field, entry.oldValue);
    await model.update({
      where: { id: entry.entityId },
      data: { [entry.field]: value },
    });
    description = `Restored ${entry.field} on ${entry.entityLabel ?? entry.entityId}`;
  } else if (entry.action === "CREATE" || entry.action === "LINK") {
    await model.update({
      where: { id: entry.entityId },
      data: { deletedAt: new Date() },
    });
    description = `Removed ${entry.entityLabel ?? entry.entityType} that was added`;
  } else if (entry.action === "DELETE" || entry.action === "UNLINK") {
    await model.update({
      where: { id: entry.entityId },
      data: { deletedAt: null },
    });
    description = `Brought back ${entry.entityLabel ?? entry.entityType}`;
  } else {
    return {
      ok: false,
      message: `A "${entry.action.toLowerCase()}" entry can't be undone.`,
    };
  }

  await db.auditLog.update({
    where: { id: auditId },
    data: { rolledBackAt: new Date(), rolledBackById: admin.id },
  });

  await recordAudit({
    actor: { kind: "user", user: admin },
    action: "ROLLBACK",
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityLabel: entry.entityLabel,
    field: entry.field,
    oldValue: entry.newValue,
    newValue: entry.oldValue,
  });

  return { ok: true, message: description };
}
