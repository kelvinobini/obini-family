import type { Metadata } from "next";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { APP_LONG_NAME, APP_NAME } from "@/lib/settings";
import FamilyCrest from "@/components/FamilyCrest";
import ContributeForm from "./ContributeForm";

export const metadata: Metadata = {
  title: `Help us record your family · ${APP_NAME}`,
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * The no-account door.
 *
 * Reached from a link on WhatsApp. There is no session here and no sign-in
 * prompt anywhere on the page — the token is the credential, it works once,
 * and it expires. An expired link says who to ask rather than showing an
 * error code, because the person reading it is usually the least technical
 * member of the family.
 */
export default async function ContributePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const link = await db.contributorLink.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { aboutPerson: { select: { legalName: true } } },
  });

  const problem = !link
    ? "This link isn't one we recognise."
    : link.revokedAt
      ? "This link was cancelled."
      : link.usedAt
        ? "This link has already been used."
        : link.expiresAt.getTime() <= Date.now()
          ? "This link has expired."
          : null;

  return (
    <main
      id="main"
      className="mx-auto w-full max-w-lg px-5 py-8 sm:py-12"
    >
      <div className="mb-7 text-center">
        <FamilyCrest className="mx-auto mb-4 h-20 w-20" />
        <h1 className="text-3xl font-semibold">{APP_LONG_NAME}</h1>
      </div>

      {problem ? (
        <div className="card p-7 text-center">
          <h2 className="mb-3 text-xl font-semibold">{problem}</h2>
          <p className="prose-family">
            {link
              ? `Please ask ${link.createdByName} to send you a fresh one — it takes them a moment.`
              : "Please ask whoever sent it to you for a fresh one."}
          </p>
          <p className="mt-5 text-[0.9rem] text-[var(--color-ink-faint)]">
            Links are good for a short while and work only once. That&apos;s on
            purpose — it keeps the family record private.
          </p>
        </div>
      ) : (
        <>
          <div className="card mb-5 p-6">
            <h2 className="mb-2 text-xl font-semibold">
              {link!.createdByName} would like your help
            </h2>
            <p className="prose-family">
              We&apos;re putting together a record of the family — who everyone
              is, where we come from, and the things worth remembering. Would
              you tell us a little about yourself?
            </p>
            <p className="mt-3 text-[0.95rem] text-[var(--color-ink-soft)]">
              There is nothing to sign up for and no password to make. Answer
              what you can and leave the rest blank.
            </p>
          </div>

          <div className="card p-6">
            <ContributeForm token={token} inviterName={link!.createdByName} />
          </div>
        </>
      )}
    </main>
  );
}
