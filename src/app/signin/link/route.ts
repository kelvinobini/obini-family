import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { createSession, setSessionCookie } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { appUrl } from "@/lib/settings";

/**
 * The tap-through half of the magic link. Same single-use rules as the code —
 * this exists so a relative who finds typing hard never has to type anything.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const fail = (reason: string) =>
    NextResponse.redirect(appUrl(`/signin?problem=${encodeURIComponent(reason)}`));

  if (!token) return fail("That link was incomplete.");

  const record = await db.loginToken.findUnique({
    where: { linkHash: hashToken(token) },
  });

  if (!record || record.consumedAt || record.expiresAt.getTime() <= Date.now()) {
    return fail("That sign-in link has expired. Ask for a fresh one below.");
  }

  const user = await db.user.findFirst({
    where: record.email
      ? { email: record.email, deletedAt: null, status: "ACTIVE" }
      : { phone: record.phone ?? "", deletedAt: null, status: "ACTIVE" },
  });
  if (!user) return fail("That link no longer matches a family account.");

  await db.loginToken.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });

  const session = await createSession(user.id);
  await setSessionCookie(session);

  await recordAudit({
    actor: { kind: "user", user },
    action: "LOGIN",
    entityType: "User",
    entityId: user.id,
    entityLabel: user.name,
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.redirect(
    appUrl(user.personId ? `/people/${user.personId}` : "/home")
  );
}
