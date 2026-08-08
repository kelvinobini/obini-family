"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Entry = {
  id: string;
  actorLabel: string;
  action: string;
  entityType: string;
  entityLabel: string | null;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  rolledBackAt: string | null;
  rolledBackBy: string | null;
  undoable: boolean;
};

/**
 * Every change ever made, newest first, each one individually reversible.
 *
 * Undo is per row rather than per record because the audit log stores one
 * entry per changed field — so correcting a wrongly-edited birthplace does not
 * also throw away the three good edits somebody made in the same sitting.
 */
export default function ActivityLog({ entries }: { entries: Entry[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function undo(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/audit/${id}/rollback`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? data.error ?? "That couldn't be undone.");
        return;
      }
      setResult((r) => ({ ...r, [id]: data.message }));
      router.refresh();
    } catch {
      setError("We couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  if (entries.length === 0) {
    return (
      <div className="card p-8 text-center text-[var(--color-ink-soft)]">
        Nothing has been changed yet.
      </div>
    );
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-[var(--color-rose-soft)] px-4 py-3 text-[var(--color-rose)]">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {entries.map((e) => (
          <li
            key={e.id}
            className={`card p-4 ${e.rolledBackAt ? "opacity-60" : ""}`}
          >
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold">{e.actorLabel}</span>
              <span className="text-[var(--color-ink-soft)]">
                {describe(e)}
              </span>
              <span className="ml-auto text-[0.8rem] text-[var(--color-ink-faint)]">
                {new Date(e.createdAt).toLocaleString()}
              </span>
            </div>

            {e.field && (
              <p className="mt-2 text-[0.9rem]">
                <span className="text-[var(--color-ink-faint)] line-through">
                  {e.oldValue || "(blank)"}
                </span>
                {"  →  "}
                <span className="font-medium">{e.newValue || "(blank)"}</span>
              </p>
            )}

            {e.rolledBackAt ? (
              <p className="mt-2 text-[0.85rem] text-[var(--color-ink-faint)]">
                Undone by {e.rolledBackBy ?? "an admin"} on{" "}
                {new Date(e.rolledBackAt).toLocaleDateString()}.
              </p>
            ) : result[e.id] ? (
              <p className="mt-2 rounded-lg bg-[var(--color-sage-soft)] px-3 py-2 text-[0.9rem] text-[var(--color-sage)]">
                {result[e.id]}
              </p>
            ) : (
              e.undoable && (
                <button
                  className="btn btn-quiet mt-2 px-3 py-1.5 text-[0.9rem]"
                  disabled={busy === e.id}
                  onClick={() => undo(e.id)}
                >
                  {busy === e.id ? "Undoing…" : "Undo this"}
                </button>
              )
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function describe(e: Entry): string {
  const what = e.entityLabel ? `${e.entityLabel}` : e.entityType.toLowerCase();
  switch (e.action) {
    case "CREATE":
      return `added ${what}`;
    case "UPDATE":
      return `changed ${e.field ?? "something"} on ${what}`;
    case "DELETE":
      return `removed ${what}`;
    case "RESTORE":
      return `brought back ${what}`;
    case "LINK":
      return `connected ${what}`;
    case "UNLINK":
      return `disconnected ${what}`;
    case "APPROVE":
      return `approved a suggestion`;
    case "REJECT":
      return `turned down a suggestion`;
    case "INVITE":
      return `invited ${what}`;
    case "REVOKE":
      return `cancelled ${what}`;
    case "ROLE_CHANGE":
      return `changed what ${what} is allowed to do`;
    case "LOGIN":
      return `signed in`;
    case "ROLLBACK":
      return `undid a change to ${what}`;
    case "EXPORT":
      return `exported the family record`;
    default:
      return `${e.action.toLowerCase()} ${what}`;
  }
}
