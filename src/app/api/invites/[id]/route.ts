import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, NotFoundError } from "@/lib/api";
import { getActor, clientIp } from "@/lib/auth";
import { assertRole } from "@/lib/authz";
import { hashToken, randomToken, daysFromNow } from "@/lib/tokens";
import { sendEmail, invitationEmail } from "@/lib/mail";
import { appUrl, getSettings } from "@/lib/settings";
import { recordAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Resend — issues a brand new token, so the old link stops working. */
export const POST = handler(async (req: NextRequest, ctx: Ctx) => {
  const actor = await getActor();
  assertRole(actor, "invite:manage");
  const { id } = await ctx.params;

  const invite = await db.invitation.findUnique({
    where: { id },
    include: { person: { select: { legalName: true } } },
  });
  if (!invite) throw new NotFoundError("That invitation no longer exists.");
  if (invite.acceptedAt) {
    return ok({ ok: false, message: "They've already joined." }, 409);
  }
  if (invite.revokedAt) {
    return ok({ ok: false, message: "That invitation was cancelled." }, 409);
  }

  const settings = await getSettings();
  const token = randomToken(32);
  const expiresAt = daysFromNow(settings.invitationDays);

  await db.invitation.update({
    where: { id },
    data: {
      tokenHash: hashToken(token),
      expiresAt,
      lastSentAt: new Date(),
      sendCount: { increment: 1 },
    },
  });

  const link = appUrl(`/invite/${token}`);
  if (invite.email) {
    await sendEmail({
      to: invite.email,
      ...invitationEmail({
        inviterName: actor.name,
        link,
        role: invite.role,
        personName: invite.person?.legalName,
        message: invite.message,
        expiresAt,
      }),
    });
  }

  await recordAudit({
    actor: { kind: "user", user: actor },
    action: "INVITE",
    entityType: "Invitation",
    entityId: id,
    entityLabel: invite.email ?? invite.phone ?? "an invitation",
    newValue: { resent: true },
    ip: clientIp(req.headers),
  });

  return ok({ ok: true, link, expiresAt, sentByEmail: !!invite.email });
});

/** Revoke. The link dies immediately. */
export const DELETE = handler(async (req: NextRequest, ctx: Ctx) => {
  const actor = await getActor();
  assertRole(actor, "invite:manage");
  const { id } = await ctx.params;

  const invite = await db.invitation.findUnique({ where: { id } });
  if (!invite) throw new NotFoundError("That invitation no longer exists.");

  await db.invitation.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  await recordAudit({
    actor: { kind: "user", user: actor },
    action: "REVOKE",
    entityType: "Invitation",
    entityId: id,
    entityLabel: invite.email ?? invite.phone ?? "an invitation",
    ip: clientIp(req.headers),
  });

  return ok({ ok: true });
});
