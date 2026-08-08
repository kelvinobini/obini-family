import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import AppShell from "@/components/AppShell";

/**
 * The real gate for every signed-in page. Middleware only saw that a cookie
 * existed; this checks that it resolves to a live, active account, and it runs
 * before any child page renders.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getActor();
  if (!actor) redirect("/signin");

  const pendingReviews =
    actor.role === "ADMIN"
      ? await db.suggestion.count({ where: { status: "PENDING" } })
      : 0;

  return (
    <AppShell
      user={{
        name: actor.name,
        firstName: actor.name.split(" ")[0] ?? actor.name,
        role: actor.role,
        personId: actor.personId,
        isPrimaryAdmin: actor.isPrimaryAdmin,
      }}
      pendingReviews={pendingReviews}
    >
      {children}
    </AppShell>
  );
}
