"use client";

import { useState } from "react";
import FamilyCrest from "@/components/FamilyCrest";

/**
 * The form an elder fills in from a WhatsApp link.
 *
 * Six questions on the first screen and nothing else. No account, no password,
 * no email verification — the link itself is the credential, it works once, and
 * it expires. Extra questions are folded away behind a single "there's more I
 * can tell you" toggle so the page never looks like paperwork.
 *
 * Photos are shrunk in the browser before sending. A modern phone camera
 * produces 6MB files and this has to work on a patchy connection.
 */
export default function ContributeForm({
  token,
  inviterName,
}: {
  token: string;
  inviterName: string;
}) {
  const [more, setMore] = useState(false);
  const [children, setChildren] = useState<string[]>([""]);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoName(file.name);
    try {
      setPhotoBlob(await shrinkImage(file));
    } catch {
      // If the browser is too old for canvas resizing, send the original.
      setPhotoBlob(file);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    setError(null);

    const form = new FormData(e.currentTarget);
    form.delete("photo");
    if (photoBlob) form.set("photo", photoBlob, photoName ?? "photo.jpg");

    try {
      const res = await fetch(`/api/contribute/${token}`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try once more.");
        setState("idle");
        return;
      }
      setMessage(data.message);
      setState("done");
    } catch {
      setError(
        "We couldn't reach the family record. Check your connection and try again — nothing you typed has been lost."
      );
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="card p-7 text-center">
        <FamilyCrest className="mx-auto mb-4 h-16 w-16" />
        <h2 className="mb-3 text-2xl font-semibold">Thank you</h2>
        <p className="prose-family">{message}</p>
        <p className="mt-5 text-[0.9rem] text-[var(--color-ink-faint)]">
          You can close this page now. There&apos;s nothing to sign up for and
          no password to remember.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-[var(--color-rose)] bg-[var(--color-rose-soft)] px-4 py-3 text-[var(--color-rose)]"
        >
          {error}
        </p>
      )}

      <Field
        name="legalName"
        label="Your full name"
        required
        autoFocus
        placeholder="e.g. Nnamdi Obini"
      />

      <Field
        name="nativeName"
        label="Your native name, if you have one"
        placeholder="The name your people call you"
      />

      <div>
        <label htmlFor="gender" className="label">
          Are you
        </label>
        <select id="gender" name="gender" className="field" defaultValue="UNKNOWN">
          <option value="UNKNOWN">Rather not say</option>
          <option value="MALE">A man</option>
          <option value="FEMALE">A woman</option>
          <option value="OTHER">Something else</option>
        </select>
      </div>

      <Field
        name="birthDateText"
        label="When were you born?"
        placeholder="A year is plenty — “about 1948” is fine"
        hint="Don't worry if you're not sure of the exact date. Nobody is."
      />

      <Field
        name="hometown"
        label="Where is your hometown?"
        placeholder="e.g. Umuahia"
      />

      <Field name="father" label="Your father's name" placeholder="If you know it" />
      <Field name="mother" label="Your mother's name" placeholder="If you know it" />

      <div>
        <label htmlFor="photo" className="label">
          A photograph of yourself
        </label>
        <input
          id="photo"
          name="photo"
          type="file"
          accept="image/*"
          capture="user"
          className="field py-2.5"
          onChange={onPhoto}
        />
        <p className="hint">
          {photoName
            ? `${photoName} — ready to send.`
            : "Optional. You can take one now with your phone camera."}
        </p>
      </div>

      {!more ? (
        <button
          type="button"
          onClick={() => setMore(true)}
          className="btn btn-secondary w-full"
        >
          There&apos;s more I can tell you
        </button>
      ) : (
        <div className="space-y-5 rounded-xl border border-[var(--color-paper-3)] bg-[var(--color-paper-2)] p-4">
          <Field name="nickname" label="What do people call you?" />
          <Field name="spouse" label="Your husband or wife's name" />

          <div>
            <span className="label">Your children&apos;s names</span>
            {children.map((value, i) => (
              <input
                key={i}
                name="children"
                className="field mb-2"
                placeholder={`Child ${i + 1}`}
                value={value}
                onChange={(e) => {
                  const next = [...children];
                  next[i] = e.target.value;
                  setChildren(next);
                }}
              />
            ))}
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setChildren([...children, ""])}
            >
              + Add another child
            </button>
          </div>

          <div>
            <label htmlFor="lifeStory" className="label">
              Anything you&apos;d like remembered
            </label>
            <textarea
              id="lifeStory"
              name="lifeStory"
              rows={6}
              className="field"
              placeholder="Where you grew up, the work you did, what you'd want your grandchildren to know…"
            />
          </div>

          <Field
            name="contactEmail"
            label="An email address, if you use one"
            type="email"
            hint="Only so the family can reach you. It is never shown publicly."
          />
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary w-full text-lg"
        disabled={state === "sending"}
      >
        {state === "sending" ? "Sending…" : "Send this to the family"}
      </button>

      <p className="text-center text-[0.9rem] text-[var(--color-ink-faint)]">
        {inviterName} will read it over before it goes into the family record.
      </p>
    </form>
  );
}

function Field({
  name,
  label,
  hint,
  ...rest
}: {
  name: string;
  label: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input id={name} name={name} className="field" {...rest} />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

/**
 * Redraws the photo at no more than 1600px on its long edge and re-encodes it
 * as JPEG. A 6MB camera original becomes a few hundred kilobytes, which is the
 * difference between an upload that completes on a weak signal and one that
 * doesn't.
 */
async function shrinkImage(file: File, maxEdge = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))),
      "image/jpeg",
      quality
    );
  });
}
