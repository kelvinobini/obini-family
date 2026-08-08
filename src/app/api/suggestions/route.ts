import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { getActor, AuthError } from "@/lib/auth";
import { assertRole } from "@/lib/authz";
import { suggestionInput } from "@/lib/validation";

/** The queue itself. Admin only. */
export const GET = handler(async (req: NextRequest) => {
  const actor = await getActor();
  assertRole(actor, "suggestion:review");

  const status = (req.nextUrl.searchParams.get("status") ?? "PENDING") as
    | "PENDING"
    | "APPROVED"
    | "REJECTED";

  const suggestions = await db.suggestion.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      targetPerson: { select: { id: true, legalName: true } },
      submittedBy: { select: { id: true, name: true, role: true } },
      viaLink: { select: { id: true, label: true, createdByName: true } },
      media: { select: { id: true, kind: true, caption: true } },
    },
  });

  return ok({ suggestions });
});

/**
 * Anything a member proposes about a record they do not own — and that
 * includes relationship changes on their own profile, because a relationship
 * always writes to a second person too.
 */
export const POST = handler(async (req: NextRequest) => {
  const actor = await getActor();
  if (!actor) throw new AuthError("Not signed in", 401);
  assertRole(actor, "suggestion:create");

  const input = suggestionInput.parse(await req.json());

  const suggestion = await db.suggestion.create({
    data: {
      kind: input.kind,
      targetPersonId: input.targetPersonId ?? null,
      payload: input.payload as object,
      note: input.note ?? null,
      submittedById: actor.id,
      status: "PENDING",
    },
  });

  return ok(
    {
      id: suggestion.id,
      message:
        "Thank you — that's gone to the family admin to look over. " +
        "You'll see it on the record once they've said yes.",
    },
    201
  );
});
