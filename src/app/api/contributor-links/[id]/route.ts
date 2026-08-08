import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok, NotFoundError } from "@/lib/api";
import { getActor, clientIp, AuthError } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Revoke. Takes effect on the next tap of the link. */
export const DELETE = handler(async (req: NextRequest, ctx: Ctx) => {
  const actor = await getActor();
  if (!actor) throw new AuthError("Not signed in", 401);
  const { id } = await ctx.params;

  const link = await db.contributorLink.findUnique({ where: { id } });
  if (!link) throw new NotFoundError("That link no longer exists.");

  // An admin can revoke anyone's link; a member only their own.
  if (actor.role !== "ADMIN" && link.createdById !== actor.id) {
    throw new AuthError("You can only cancel links you created.", 403);
  }

  await db.contributorLink.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  await recordAudit({
    actor: { kind: "user", user: actor },
    action: "REVOKE",
    entityType: "ContributorLink",
    entityId: id,
    entityLabel: link.label,
    ip: clientIp(req.headers),
  });

  return ok({ ok: true });
});
