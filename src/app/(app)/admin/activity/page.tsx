import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getActor } from "@/lib/auth";
import ActivityLog, { type Entry } from "./ActivityLog";

export const metadata: Metadata = { title: "Everything that's happened" };
export const dynamic = "force-dynamic";

/** Actions that can be mechanically reversed. A login cannot be un-happened. */
const UNDOABLE = new Set(["UPDATE", "CREATE", "DELETE", "LINK", "UNLINK", "RESTORE"]);
const UNDOABLE_ENTITIES = new Set([
  "Person",
  "Union",
  "ParentChild",
  "SiblingLink",
  "Milestone",
  "Story",
  "Media",
  "Event",
  "Comment",
]);

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string }>;
}) {
  const actor = (await getActor())!;
  if (actor.role !== "ADMIN") redirect("/home");

  const { person } = await searchParams;

  const rows = await db.auditLog.findMany({
    where: person ? { entityId: person } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { rolledBackBy: { select: { name: true } } },
  });

  const entries: Entry[] = rows.map((r) => ({
    id: r.id,
    actorLabel: r.actorLabel,
    action: r.action,
    entityType: r.entityType,
    entityLabel: r.entityLabel,
    field: r.field,
    oldValue: render(r.oldValue),
    newValue: render(r.newValue),
    createdAt: r.createdAt.toISOString(),
    rolledBackAt: r.rolledBackAt?.toISOString() ?? null,
    rolledBackBy: r.rolledBackBy?.name ?? null,
    undoable:
      !r.rolledBackAt &&
      UNDOABLE.has(r.action) &&
      UNDOABLE_ENTITIES.has(r.entityType) &&
      // A field update needs a field to write back to.
      (r.action !== "UPDATE" || !!r.field),
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Everything that&apos;s happened</h1>
        <p className="mt-1 text-[var(--color-ink-soft)]">
          Every change to the family record, who made it, and what it was
          before. You can undo any single one — and undoing is itself recorded
          here.
        </p>
      </header>
      <ActivityLog entries={entries} />
      {rows.length === 200 && (
        <p className="mt-4 text-center text-[0.9rem] text-[var(--color-ink-faint)]">
          Showing the 200 most recent changes.
        </p>
      )}
    </div>
  );
}

/** Audit values are JSON. Turn them into something a person can read. */
function render(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    // ISO timestamps read badly in a diff; show just the date.
    const m = /^(\d{4}-\d{2}-\d{2})T/.exec(value);
    return m ? m[1]! : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.join(", ");
  return JSON.stringify(value);
}
