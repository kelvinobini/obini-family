import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { hashToken, randomToken, daysFromNow } from "@/lib/tokens";
import type { Role, User, Person } from "@prisma/client";
import { SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth-constants";

export { SESSION_COOKIE };

export type Actor = User & { person: Person | null };

/**
 * The signed-in user, or null. Cached per request so a page that checks
 * permissions in six places still makes one query.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: { include: { person: true } } },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (session.user.deletedAt) return null;
  if (session.user.status !== "ACTIVE") return null;

  // Touch lastSeenAt at most once an hour so we are not writing on every render.
  if (Date.now() - session.lastSeenAt.getTime() > 60 * 60 * 1000) {
    void db.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }

  return session.user;
});

/** Use in pages/routes that must have a user. Throws — callers convert to 401. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new AuthError("Not signed in", 401);
  return actor;
}

export async function requireRole(...roles: Role[]): Promise<Actor> {
  const actor = await requireActor();
  if (!roles.includes(actor.role)) {
    throw new AuthError("You don't have permission to do that", 403);
  }
  return actor;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export async function createSession(userId: string): Promise<string> {
  const token = randomToken(32);
  const h = await headers();
  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: daysFromNow(SESSION_DAYS),
      ip: clientIp(h),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  await db.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });
  return token;
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) {
    await db.session
      .updateMany({
        where: { tokenHash: hashToken(raw) },
        data: { revokedAt: new Date() },
      })
      .catch(() => {});
  }
  jar.delete(SESSION_COOKIE);
}

export function clientIp(h: Headers): string | null {
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip");
}
