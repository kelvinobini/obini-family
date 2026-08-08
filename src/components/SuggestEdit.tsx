"use client";

import { useState } from "react";

const FIELDS = [
  { key: "legalName", label: "Full name" },
  { key: "nativeName", label: "Native name" },
  { key: "praiseName", label: "Praise name (oríkì)" },
  { key: "nickname", label: "Known as" },
  { key: "baptismalName", label: "Baptismal name" },
  { key: "birthDateText", label: "When they were born" },
  { key: "birthPlace", label: "Where they were born" },
  { key: "hometown", label: "Hometown" },
  { key: "village", label: "Village" },
  { key: "compound", label: "Compound" },
  { key: "occupation", label: "Occupation" },
  { key: "education", label: "Education" },
  { key: "religion", label: "Religion" },
  { key: "lifeStory", label: "Their story" },
] as const;

/**
 * What a member gets on somebody else's record instead of an edit form.
 *
 * The distinction matters and the wording says so: this is not a change, it is
 * a message to the family admin. Nothing here writes to the person's record —
 * it creates a pending suggestion, and the API would refuse a direct write
 * anyway.
 */
export default function SuggestEdit({
  personId,
  personName,
}: {
  personId: string;
  personName: string;
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<string>("legalName");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "FIELD_EDIT",
          targetPersonId: personId,
          payload: { [field]: value },
          note: note || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We couldn't send that.");
        setState("idle");
        return;
      }
      setState("sent");
    } catch {
      setError("We couldn't reach the server. Check your connection.");
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <p className="rounded-xl border border-[var(--color-sage)] bg-[var(--color-sage-soft)] px-4 py-3 text-[0.95rem] text-[var(--color-sage)]">
        Thank you — that&apos;s with the family admin now. It&apos;ll appear on{" "}
        {personName}&apos;s page once they say yes.
      </p>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-warm">
        Suggest a correction
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="w-full space-y-3">
      <p className="text-[0.95rem] text-[var(--color-ink-soft)]">
        You can&apos;t edit {personName}&apos;s page directly — only they, their
        guardian, or an admin can. Tell the admin what should change and
        they&apos;ll put it right.
      </p>

      {error && (
        <p role="alert" className="text-[0.95rem] text-[var(--color-rose)]">
          {error}
        </p>
      )}

      <div>
        <label htmlFor="field" className="label">
          What needs correcting?
        </label>
        <select
          id="field"
          className="field"
          value={field}
          onChange={(e) => setField(e.target.value)}
        >
          {FIELDS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="value" className="label">
          What should it say?
        </label>
        <textarea
          id="value"
          className="field"
          rows={field === "lifeStory" ? 6 : 2}
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="note" className="label">
          Anything else the admin should know? (optional)
        </label>
        <input
          id="note"
          className="field"
          placeholder="e.g. I heard this from Aunty Ify"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Send to the admin"}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
