import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ConflictError } from "@/lib/api";
import { AuthError, createSession, setSessionCookie, clientIp } from "@/lib/auth";
import { hashToken } from "@/lib/tokens";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";

const acceptInput = z.object({
  token: z.string().min(10),
  name: z.string().trim().min(1, "Please tell us your name.").max(200),
  email: z.string().trim().email("That email doesn't look right.").optional().nullable(),
});

/**
 * Accepting an invitation is the only way an account comes into existence.
 * The role was fixed by the admin when they sent it — nothing in this request
 * can change it.
 */
export const POST = handler(async (req: NextRequest) => {
  const ip = clientIp(req.headers) ?? "unknown";
  if (!rateLimit(`accept:${ip}`, 10, 15 * 60 * 1000).ok) {
    throw new AuthError("Too many attempts. Please wait a few minutes.", 429);
  }

  const input = acceptInput.parse(await req.json());

  const invite = await db.invitation.findUnique({
    where: { tokenHash: hashToken(input.token) },
    include: { person: { select: { id: true, legalName: true } } },
  });

  if (!invite) throw new AuthError("That invitation link isn't valid.", 401);
  if (invite.revokedAt) throw new AuthError("That invitation was cancelled.", 401);
  if (invite.acceptedAt) {
    throw new AuthError(
      "That invitation has already been used. Try signing in instead.",
      409
    );
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    throw new AuthError(
      "That invitation has expired. Ask whoever invited you to send a fresh one.",
      401
    );
  }

  // The invitation fixes the address. A supplied email is only accepted when
  // the invitation carried none (the phone-invite case).
  const email = invite.email ?? input.email?.toLowerCase() ?? null;
  if (!email && !invite.phone) {
    throw new ConflictError("That invitation is missing a way to sign you in.");
  }

  if (email) {
    const clash = await db.user.findFirst({ where: { email, deletedAt: null } });
    if (clash) {
      throw new ConflictError(
        "There's already an account with that email. Try signing in instead."
      );
    }
  }

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        phone: invite.phone,
        name: input.name,
        role: invite.role,
        personId: invite.personId,
        status: "ACTIVE",
      },
    });

    await tx.invitation.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    // A relative who now speaks for their own record is the best evidence we
    // have that the record is right.
    if (invite.personId) {
      await tx.person.update({
        where: { id: invite.personId },
        data: {
          verification: "VERIFIED",
          lastVerifiedById: created.id,
          lastVerifiedAt: new Date(),
        },
      });
    }

    return created;
  });

  const session = await createSession(user.id);
  await setSessionCookie(session);

  await recordAudit({
    actor: { kind: "user", user },
    action: "CREATE",
    entityType: "User",
    entityId: user.id,
    entityLabel: user.name,
    newValue: { role: user.role, viaInvitation: invite.id },
    ip,
    userAgent: req.headers.get("user-agent"),
  });

  return ok({
    ok: true,
    redirect: user.personId ? `/people/${user.personId}` : "/home",
    name: user.name.split(" ")[0],
  });
});
