"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Two steps, one field each. No password is ever created, requested or stored,
 * because the people this has to work for will not manage one.
 */
export default function SignInForm({ problem }: { problem?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"identify" | "code">("identify");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(problem ?? null);
  const [error, setError] = useState<string | null>(problem ?? null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json();
      setMessage(data.message ?? "Check your email for a code.");
      setStep("code");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "That code didn't work.");
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
    <div className="w-full">
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-[var(--color-rose)] bg-[var(--color-rose-soft)] px-4 py-3 text-[0.95rem] text-[var(--color-rose)]"
        >
          {error}
        </p>
      )}

      {step === "identify" ? (
        <form onSubmit={requestCode} className="space-y-4">
          <div>
            <label htmlFor="identifier" className="label">
              The email address your invitation was sent to
            </label>
            <input
              id="identifier"
              className="field"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              required
              placeholder="you@example.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
            <p className="hint">
              We&apos;ll send you a six-digit code. There is no password to remember.
            </p>
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Sending…" : "Send me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-4">
          {message && (
            <p className="rounded-xl border border-[var(--color-paper-3)] bg-[var(--color-paper-2)] px-4 py-3 text-[0.95rem] text-[var(--color-ink-soft)]">
              {message}
            </p>
          )}
          <div>
            <label htmlFor="code" className="label">
              Your six-digit code
            </label>
            <input
              id="code"
              className="field text-center text-2xl tracking-[0.5em]"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              autoFocus
              required
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <p className="hint">
              Sent to {identifier}. It works for 15 minutes.
            </p>
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Checking…" : "Come in"}
          </button>
          <button
            type="button"
            className="btn btn-quiet w-full"
            onClick={() => {
              setStep("identify");
              setCode("");
              setError(null);
            }}
          >
            Use a different email
          </button>
        </form>
      )}
    </div>
  );
}
