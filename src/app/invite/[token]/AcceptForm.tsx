"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AcceptForm({
  token,
  suggestedName,
  needsEmail,
}: {
  token: string;
  suggestedName: string;
  needsEmail: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(suggestedName);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, email: needsEmail ? email : null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We couldn't complete that.");
        return;
      }
      router.push(data.redirect ?? "/home");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-[var(--color-rose)] bg-[var(--color-rose-soft)] px-4 py-3 text-[0.95rem] text-[var(--color-rose)]"
        >
          {error}
        </p>
      )}

      <div>
        <label htmlFor="name" className="label">
          What should the family call you?
        </label>
        <input
          id="name"
          className="field"
          required
          autoFocus
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Chidi Obini"
        />
      </div>

      {needsEmail && (
        <div>
          <label htmlFor="email" className="label">
            An email address to sign in with
          </label>
          <input
            id="email"
            className="field"
            type="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <p className="hint">
            We&apos;ll send a six-digit code here whenever you come back. No password.
          </p>
        </div>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Just a moment…" : "Join the family record"}
      </button>
    </form>
  );
}
