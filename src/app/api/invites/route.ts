import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, ConflictError } from "@/lib/api";
import { getActor, clientIp } from "@/lib/auth";
import { assertRole } from "@/lib/authz";
import { inviteInput } from "@/lib/validation";
import { hashToken, randomToken, daysFromNow } from "@/lib/tokens";
import { sendEmail, invitationEmail } from "@/lib/mail";
import { appUrl, getSettings } from "@/lib/settings";
import { recordAudit } from "@/lib/audit";

/** Everyone currently waiting to accept. Admin only. */
export const GET = handler(async () => {
  const actor = await getActor();
  assertRole(actor, "invite:manage");

  const invites = await db.invitation.findMany({
    where: { acceptedAt: null, revokedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      person: { select: { id: true, legalName: true } },
      invitedBy: { select: { name: true } },
    },
  });

  return ok({
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      phone: i.phone,
      name: i.name,
      role: i.role,
      person: i.person,
      invitedBy: i.invitedBy?.name ?? "Someone",
      expiresAt: i.expiresAt,
      expired: i.expiresAt.getTime() <= Date.now(),
      sendCount: i.sendCount,
      lastSentAt: i.lastSentAt,
    })),
  });
});

/**
 * Invite someone in. The role is chosen here, up front, by an admin — an
 * invitation is the only way an account is ever created in this app.
 */
export const POST = handler(async (req: NextRequest) => {
  const actor = await getActor();
  assertRole(actor, "invite:create");

  const input = inviteInput.parse(await req.json());
  const settings = await getSettings();
  const email = input.email?.toLowerCase() ?? null;

  // Already family?
  if (email || input.phone) {
    const existing = await db.user.findFirst({
      where: {
        OR: [
          email ? { email } : { id: "never" },
          input.phone ? { phone: input.phone } : { id: "never" },
        ],
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictError(
        `${existing.name} already has an account here. You can change their role instead of inviting them again.`
      );
    }

    const pending = await db.invitation.findFirst({
      where: {
        OR: [email ? { email } : { id: "never" }, input.phone ? { phone: input.phone } : { id: "never" }],
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (pending) {
      throw new ConflictError(
        "There's already an invitation waiting for them. You can resend it from the pending list."
      );
    }
  }

  // If we're attaching them to an existing node, make sure it is free.
  if (input.personId) {
    const person = await db.person.findFirst({
      where: { id: input.personId, deletedAt: null },
      include: { account: { select: { id: true, name: true } } },
    });
    if (!person) throw new ConflictError("We couldn't find that person in the tree.");
    if (person.account) {
      throw new ConflictError(
        `${person.legalName} is already linked to ${person.account.name}'s account.`
      );
    }
  }

  const token = randomToken(32);
  const expiresAt = daysFromNow(input.expiresInDays ?? settings.invitationDays);

  const invite = await db.invitation.create({
    data: {
      email,
      phone: input.phone ?? null,
      name: input.name ?? null,
      role: input.role,
      personId: input.personId ?? null,
      message: input.message ?? null,
      tokenHash: hashToken(token),
      invitedById: actor.id,
      expiresAt,
    },
    include: { person: { select: { legalName: true } } },
  });

  const link = appUrl(`/invite/${token}`);
  if (email) {
    await sendEmail({
      to: email,
      ...invitationEmail({
        inviterName: actor.name,
        link,
        role: input.role,
        personName: invite.person?.legalName,
        message: input.message,
        expiresAt,
      }),
    });
  }

  await recordAudit({
    actor: { kind: "user", user: actor },
    action: "INVITE",
    entityType: "Invitation",
    entityId: invite.id,
    entityLabel: email ?? input.phone ?? input.name ?? "an invitation",
    newValue: { role: input.role, personId: input.personId ?? null },
    ip: clientIp(req.headers),
    userAgent: req.headers.get("user-agent"),
  });

  return ok(
    {
      id: invite.id,
      // Returned so an admin can hand the link over on WhatsApp when the
      // relative has no working email. It is shown once and not stored in clear.
      link,
      sentByEmail: !!email,
      expiresAt,
    },
    201
  );
});
