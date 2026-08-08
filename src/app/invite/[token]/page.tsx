import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { APP_LONG_NAME, APP_NAME } from "@/lib/settings";
import FamilyCrest from "@/components/FamilyCrest";
import AcceptForm from "./AcceptForm";

export const metadata: Metadata = { title: `You're invited · ${APP_NAME}` };
export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invite = await db.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      person: { select: { legalName: true } },
      invitedBy: { select: { name: true } },
    },
  });

  const inviter = invite?.invitedBy?.name ?? "Someone in the family";

  let problem: string | null = null;
  if (!invite) problem = "This invitation link isn't valid.";
  else if (invite.revokedAt) problem = "This invitation was cancelled.";
  else if (invite.acceptedAt) problem = "This invitation has already been used.";
  else if (invite.expiresAt.getTime() <= Date.now())
    problem = "This invitation has expired.";

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10"
    >
      <div className="mb-7 text-center">
        <FamilyCrest className="mx-auto mb-5 h-20 w-20" />
        <h1 className="text-3xl font-semibold">{APP_LONG_NAME}</h1>
      </div>

      <div className="card p-6">
        {problem ? (
          <div className="text-center">
            <h2 className="mb-2 text-xl font-semibold">{problem}</h2>
            <p className="text-[var(--color-ink-soft)]">
              Ask {inviter} to send you a fresh one — it only takes them a moment.
            </p>
            <Link href="/signin" className="btn btn-secondary mt-5 w-full">
              I already have an account
            </Link>
          </div>
        ) : (
          <>
            <h2 className="mb-1 text-xl font-semibold">
              {inviter} has invited you in
            </h2>
            <p className="mb-5 text-[var(--color-ink-soft)]">
              {invite!.person
                ? `You'll land straight on your own page — ${invite!.person.legalName}.`
                : "You'll be able to browse the family and add your own details."}
              {invite!.role === "VIEWER" &&
                " You'll have a look-only view, so nothing you do can change the record."}
              {invite!.role === "ADMIN" &&
                " You'll be an admin, so you can look after the whole record."}
            </p>

            {invite!.message && (
              <blockquote className="mb-5 rounded-xl border-l-4 border-[var(--color-gold)] bg-[var(--color-gold-soft)] px-4 py-3 prose-family text-[1rem]">
                “{invite!.message}”
              </blockquote>
            )}

            <AcceptForm
              token={token}
              suggestedName={invite!.name ?? invite!.person?.legalName ?? ""}
              needsEmail={!invite!.email}
            />
          </>
        )}
      </div>

      <p className="mt-6 text-center text-[0.9rem] leading-relaxed text-[var(--color-ink-faint)]">
        This is a private family record. Please don&apos;t forward this link — it
        lets whoever holds it into the archive.
      </p>
    </main>
  );
}
