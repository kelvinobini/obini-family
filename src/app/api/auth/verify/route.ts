import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { signInVerify } from "@/lib/validation";
import { hashToken, safeEqual } from "@/lib/tokens";
import { createSession, setSessionCookie, clientIp } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { AuthError } from "@/lib/auth";

/** Step two: exchange the six-digit code for a session. */
export const POST = handler(async (req: NextRequest) => {
  const { identifier, code } = signInVerify.parse(await req.json());
  const ip = clientIp(req.headers) ?? "unknown";

  const limit = rateLimit(`verify:${identifier.toLowerCase()}`, 8, 15 * 60 * 1000);
  if (!limit.ok) {
    throw new AuthError(
      "Too many attempts. Please wait a few minutes and ask for a new code.",
      429
    );
  }

  const isEmail = identifier.includes("@");
  const normalised = isEmail ? identifier.toLowerCase() : identifier.replace(/\s/g, "");

  const token = await db.loginToken.findFirst({
    where: {
      ...(isEmail ? { email: normalised } : { phone: normalised }),
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  const wrong = new AuthError("That code isn't right, or it has expired.", 401);
  if (!token) throw wrong;

  if (token.attempts >= 5) {
    await db.loginToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    });
    throw new AuthError("Too many wrong tries. Please ask for a new code.", 401);
  }

  if (!safeEqual(token.codeHash, hashToken(code))) {
    await db.loginToken.update({
      where: { id: token.id },
      data: { attempts: { increment: 1 } },
    });
    throw wrong;
  }

  const user = await db.user.findFirst({
    where: isEmail
      ? { email: normalised, deletedAt: null, status: "ACTIVE" }
      : { phone: normalised, deletedAt: null, status: "ACTIVE" },
    include: { person: true },
  });
  if (!user) throw wrong;

  // Single use.
  await db.loginToken.update({
    where: { id: token.id },
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
    ip,
    userAgent: req.headers.get("user-agent"),
  });

  return ok({
    ok: true,
    // Land a member on their own page; land an admin who has no node on the home view.
    redirect: user.personId ? `/people/${user.personId}` : "/home",
    name: user.name.split(" ")[0],
  });
});
