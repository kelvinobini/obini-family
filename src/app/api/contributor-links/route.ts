import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { getActor, clientIp, AuthError } from "@/lib/auth";
import { canCreateContributorLink } from "@/lib/authz";
import { contributorLinkInput } from "@/lib/validation";
import { hashToken, randomToken, daysFromNow } from "@/lib/tokens";
import { sendEmail, contributorLinkEmail } from "@/lib/mail";
import { appUrl, getSettings } from "@/lib/settings";
import { recordAudit } from "@/lib/audit";

/**
 * A contributor link is not an invitation: it creates no account, grants no
 * role, and everything that comes back through it is unverified until an admin
 * approves it. That is why an ordinary member can mint one — it is how you
 * reach an elder on WhatsApp without waiting on the admin.
 */
export const GET = handler(async (req: NextRequest) => {
  const actor = await getActor();
  if (!actor) throw new AuthError("Not signed in", 401);

  const links = await db.contributorLink.findMany({
    // Members see the links they made; admins see all of them.
    where: actor.role === "ADMIN" ? {} : { createdById: actor.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      aboutPerson: { select: { id: true, legalName: true } },
      _count: { select: { submissions: true } },
    },
  });

  return ok({
    links: links.map((l) => ({
      id: l.id,
      label: l.label,
      createdByName: l.createdByName,
      aboutPerson: l.aboutPerson,
      expiresAt: l.expiresAt,
      usedAt: l.usedAt,
      revokedAt: l.revokedAt,
      submissions: l._count.submissions,
      state: l.revokedAt
        ? "revoked"
        : l.usedAt
          ? "used"
          : l.expiresAt.getTime() <= Date.now()
            ? "expired"
            : "active",
    })),
  });
});

export const POST = handler(async (req: NextRequest) => {
  const actor = await getActor();
  if (!actor) throw new AuthError("Not signed in", 401);

  if (!(await canCreateContributorLink(actor))) {
    throw new AuthError(
      actor.role === "VIEWER"
        ? "Viewers can browse the family but can't invite contributions."
        : "The family admin has turned off contributor links for members. Ask them to make one.",
      403
    );
  }

  const input = contributorLinkInput.parse(await req.json());
  const settings = await getSettings();

  const token = randomToken(32);
  const expiresAt = daysFromNow(input.expiresInDays ?? settings.contributorLinkDays);

  const link = await db.contributorLink.create({
    data: {
      tokenHash: hashToken(token),
      label: input.label,
      createdById: actor.id,
      createdByName: actor.name,
      aboutPersonId: input.aboutPersonId ?? null,
      expiresAt,
    },
  });

  const url = appUrl(`/contribute/${token}`);

  if (input.sendToEmail) {
    await sendEmail({
      to: input.sendToEmail,
      ...contributorLinkEmail({ inviterName: actor.name, link: url, expiresAt }),
    });
  }

  await recordAudit({
    actor: { kind: "user", user: actor },
    action: "INVITE",
    entityType: "ContributorLink",
    entityId: link.id,
    entityLabel: input.label,
    newValue: { expiresAt: expiresAt.toISOString() },
    ip: clientIp(req.headers),
  });

  return ok(
    {
      id: link.id,
      // Shown once. We store only the hash, so this cannot be recovered later —
      // if it's lost, make a new one.
      url,
      expiresAt,
      sentByEmail: !!input.sendToEmail,
    },
    201
  );
});
