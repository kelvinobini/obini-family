import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { assertRole } from "@/lib/authz";

/** Everything that has ever happened to the family record. Admin only. */
export const GET = handler(async (req: NextRequest) => {
  const actor = await getActor();
  assertRole(actor, "audit:view");

  const params = req.nextUrl.searchParams;
  const entityId = params.get("entityId");
  const actorId = params.get("actorId");
  const take = Math.min(Number(params.get("take") ?? 100), 500);
  const cursor = params.get("cursor");

  const entries = await db.auditLog.findMany({
    where: {
      ...(entityId ? { entityId } : {}),
      ...(actorId ? { actorUserId: actorId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { rolledBackBy: { select: { name: true } } },
  });

  const hasMore = entries.length > take;
  const page = hasMore ? entries.slice(0, take) : entries;

  return ok({
    entries: page,
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  });
});
