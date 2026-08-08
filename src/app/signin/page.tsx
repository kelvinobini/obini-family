import { redirect } from "next/navigation";
import type { Metadata } from "next";
import SignInForm from "./SignInForm";
import { getActor } from "@/lib/auth";
import { APP_LONG_NAME, APP_NAME } from "@/lib/settings";
import FamilyCrest from "@/components/FamilyCrest";

export const metadata: Metadata = { title: `Sign in to ${APP_NAME}` };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ problem?: string }>;
}) {
  const actor = await getActor();
  if (actor) redirect(actor.personId ? `/people/${actor.personId}` : "/home");

  const { problem } = await searchParams;

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10"
    >
      <div className="mb-8 text-center">
        <FamilyCrest className="mx-auto mb-5 h-20 w-20" />
        <h1 className="text-3xl font-semibold">{APP_LONG_NAME}</h1>
        <p className="mt-2 text-[var(--color-ink-soft)]">
          Welcome home. Sign in to see the family.
        </p>
      </div>

      <div className="card p-6">
        <SignInForm problem={problem} />
      </div>

      <p className="mt-6 text-center text-[0.9rem] leading-relaxed text-[var(--color-ink-faint)]">
        This is a private family record. There is no public sign-up — someone in
        the family has to invite you. If you were expecting to get in and
        can&apos;t, ask whoever sent you here.
      </p>
    </main>
  );
}
