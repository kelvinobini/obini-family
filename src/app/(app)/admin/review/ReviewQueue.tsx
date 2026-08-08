"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type QueueItem = {
  id: string;
  kind: string;
  note: string | null;
  createdAt: string;
  targetPerson: { id: string; legalName: string } | null;
  from: string;
  fromKind: "member" | "contributor";
  /** Field → proposed value, already flattened by the server. */
  changes: { label: string; value: string }[];
  photos: number;
};

/**
 * The queue. Each item says plainly who asked, what they want changed, and
 * what it will look like afterwards — because an admin approving a change to
 * someone else's record should be able to see exactly what they are agreeing
 * to without opening a second tab.
 */
export default function ReviewQueue({ items }: { items: QueueItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function decide(id: string, decision: "APPROVE" | "REJECT") {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reviewNote: notes[id] || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "That didn't work.");
        return;
      }
      setDone((d) => ({ ...d, [id]: data.message }));
      router.refresh();
    } catch {
      setError("We couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="card p-8 text-center">
        <h2 className="mb-2 text-xl font-semibold">Nothing waiting</h2>
        <p className="text-[var(--color-ink-soft)]">
          When someone suggests a correction, or a relative fills in a
          contributor link, it will appear here first.
        </p>
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

      <ul className="space-y-4">
        {items.map((item) => {
          const settled = done[item.id];
          return (
            <li key={item.id} className="card p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="chip bg-[var(--color-indigo-soft)] text-[var(--color-indigo-deep)]">
                  {KIND_LABEL[item.kind] ?? item.kind}
                </span>
                {item.fromKind === "contributor" && (
                  <span className="chip bg-[var(--color-gold-soft)] text-[var(--color-gold)]">
                    From outside — not verified
                  </span>
                )}
                <span className="ml-auto text-[0.85rem] text-[var(--color-ink-faint)]">
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </div>

              <p className="mb-3">
                <strong>{item.from}</strong>{" "}
                {item.targetPerson ? (
                  <>
                    suggests a change to{" "}
                    <Link
                      href={`/people/${item.targetPerson.id}`}
                      className="font-semibold text-[var(--color-indigo-deep)] underline"
                    >
                      {item.targetPerson.legalName}
                    </Link>
                  </>
                ) : (
                  "would like to add someone new"
                )}
              </p>

              {item.changes.length > 0 && (
                <dl className="mb-3 space-y-2 rounded-xl bg-[var(--color-paper-2)] p-4">
                  {item.changes.map((c) => (
                    <div key={c.label}>
                      <dt className="text-[0.8rem] font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
                        {c.label}
                      </dt>
                      <dd className="whitespace-pre-wrap">{c.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {item.photos > 0 && (
                <p className="mb-3 text-[0.9rem] text-[var(--color-ink-soft)]">
                  {item.photos} {item.photos === 1 ? "photograph" : "photographs"}{" "}
                  attached. They stay hidden until you approve this.
                </p>
              )}

              {item.note && (
                <blockquote className="mb-3 border-l-4 border-[var(--color-gold)] pl-3 prose-family text-[1rem]">
                  “{item.note}”
                </blockquote>
              )}

              {settled ? (
                <p className="rounded-xl bg-[var(--color-sage-soft)] px-4 py-3 text-[var(--color-sage)]">
                  {settled}
                </p>
              ) : (
                <>
                  <label htmlFor={`note-${item.id}`} className="label mt-3">
                    A word back to them (optional)
                  </label>
                  <input
                    id={`note-${item.id}`}
                    className="field mb-3"
                    value={notes[item.id] ?? ""}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [item.id]: e.target.value }))
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn btn-primary"
                      disabled={busy === item.id}
                      onClick={() => decide(item.id, "APPROVE")}
                    >
                      {busy === item.id ? "…" : "Yes, add this"}
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={busy === item.id}
                      onClick={() => decide(item.id, "REJECT")}
                    >
                      No, turn it down
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

const KIND_LABEL: Record<string, string> = {
  FIELD_EDIT: "A correction",
  NEW_PERSON: "Someone new",
  NEW_RELATIONSHIP: "A new connection",
  MEDIA: "Photographs",
  DELETE_REQUEST: "Asking to remove someone",
  REMOVAL_REQUEST: "Asking to remove their details",
};
