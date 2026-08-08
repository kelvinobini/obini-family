import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getActor } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Looking after the record" };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const actor = (await getActor())!;
  // Belt and braces: the nav hides this, the layout allows it, and this
  // refuses it. Only the last one is the control.
  if (actor.role !== "ADMIN") redirect("/home");

  const [pending, people, samples, members, invites, links, changes, settings] =
    await Promise.all([
      db.suggestion.count({ where: { status: "PENDING" } }),
      db.person.count({ where: { deletedAt: null } }),
      db.person.count({ where: { deletedAt: null, isSeed: true } }),
      db.user.count({ where: { deletedAt: null, status: "ACTIVE" } }),
      db.invitation.count({
        where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
      db.contributorLink.count({
        where: { revokedAt: null, usedAt: null, expiresAt: { gt: new Date() } },
      }),
      db.auditLog.count(),
      getSettings(),
    ]);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Looking after the record</h1>
        <p className="mt-1 text-[var(--color-ink-soft)]">
          Everything the family has trusted you with.
        </p>
      </header>

      {pending > 0 && (
        <Link
          href="/admin/review"
          className="card mb-5 block border-[var(--color-terracotta)] bg-[var(--color-terracotta-soft)] p-5"
        >
          <p className="font-serif text-xl font-semibold text-[var(--color-terracotta)]">
            {pending} {pending === 1 ? "suggestion is" : "suggestions are"} waiting
            for you
          </p>
          <p className="mt-1 text-[var(--color-ink-soft)]">
            Nothing goes into the family record until you say so.
          </p>
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card
          href="/admin/review"
          title="Suggestions"
          value={pending === 0 ? "All clear" : String(pending)}
          note="Corrections and new people proposed by the family"
        />
        <Card
          href="/admin/activity"
          title="Everything that's happened"
          value={String(changes)}
          note="Every change, who made it, and how to undo it"
        />
        <Card
          href="/admin/invites"
          title="Invitations"
          value={String(invites)}
          note="Waiting to be accepted"
        />
        <Card
          href="/admin/links"
          title="Contributor links"
          value={String(links)}
          note="Open links for relatives with no account"
        />
        <Card
          href="/people"
          title="People"
          value={String(people)}
          note={`${members} with an account`}
        />
        <Card
          href="/admin/settings"
          title="Settings"
          value={settings.allowMemberContributorLinks ? "Open" : "Admin only"}
          note="Privacy, links, sample data, backups"
        />
      </div>

      {samples > 0 && (
        <div className="card mt-5 border-[var(--color-gold)] bg-[var(--color-gold-soft)] p-5">
          <h2 className="mb-1 font-serif text-lg font-semibold text-[var(--color-gold)]">
            {samples} sample people are still here
          </h2>
          <p className="text-[var(--color-ink-soft)]">
            These are placeholders for trying the app out, marked SAMPLE
            wherever they appear. Clear them from Settings before you invite
            real relatives, so nobody mistakes them for family.
          </p>
          <Link href="/admin/settings" className="btn btn-secondary mt-3">
            Go to Settings
          </Link>
        </div>
      )}
    </div>
  );
}

function Card({
  href,
  title,
  value,
  note,
}: {
  href: string;
  title: string;
  value: string;
  note: string;
}) {
  return (
    <Link href={href} className="card block p-5 hover:bg-[var(--color-paper-2)]">
      <p className="text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
        {title}
      </p>
      <p className="mt-1 font-serif text-2xl font-semibold text-[var(--color-indigo-deep)]">
        {value}
      </p>
      <p className="mt-1 text-[0.9rem] text-[var(--color-ink-soft)]">{note}</p>
    </Link>
  );
}
