import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { getActor, clientIp, AuthError } from "@/lib/auth";
import { assertRole, canEditPerson } from "@/lib/authz";
import { personInput } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { audienceFor, redactPerson } from "@/lib/privacy";
import { getSettings } from "@/lib/settings";

/** The directory and the search box both land here. */
export const GET = handler(async (req: NextRequest) => {
  const actor = await getActor();
  if (!actor) throw new AuthError("Not signed in", 401);

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const living = req.nextUrl.searchParams.get("living"); // "yes" | "no"
  const hometown = req.nextUrl.searchParams.get("hometown")?.trim();
  const take = Math.min(Number(req.nextUrl.searchParams.get("take") ?? 200), 500);

  const people = await db.person.findMany({
    where: {
      deletedAt: null,
      ...(living === "yes" ? { isDeceased: false } : {}),
      ...(living === "no" ? { isDeceased: true } : {}),
      ...(hometown ? { hometown: { contains: hometown, mode: "insensitive" } } : {}),
      ...(q
        ? {
            OR: [
              { legalName: { contains: q, mode: "insensitive" } },
              { nativeName: { contains: q, mode: "insensitive" } },
              { nickname: { contains: q, mode: "insensitive" } },
              { praiseName: { contains: q, mode: "insensitive" } },
              { baptismalName: { contains: q, mode: "insensitive" } },
              { hometown: { contains: q, mode: "insensitive" } },
              { village: { contains: q, mode: "insensitive" } },
              { compound: { contains: q, mode: "insensitive" } },
              { lifeStory: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ legalName: "asc" }],
    take,
  });

  const settings = await getSettings();
  const editable = new Set<string>();
  if (actor.role !== "ADMIN") {
    for (const p of people) {
      if (await canEditPerson(actor, p.id)) editable.add(p.id);
    }
  }

  return ok({
    people: people.map((p) =>
      redactPerson(
        p,
        audienceFor({
          role: actor.role,
          canEdit: actor.role === "ADMIN" || editable.has(p.id),
        }),
        settings
      )
    ),
  });
});

/**
 * Adding a person to the tree is an admin action. A member who wants a new
 * relative recorded sends a NEW_PERSON suggestion instead, which is why this
 * route can be strict without getting in anyone's way.
 */
export const POST = handler(async (req: NextRequest) => {
  const actor = await getActor();
  assertRole(actor, "person:create");

  const input = personInput.parse(await req.json());

  const person = await db.person.create({
    data: {
      ...input,
      titles: input.titles ?? [],
      languages: input.languages ?? [],
      recordedById: actor.id,
      lastVerifiedById: actor.id,
      lastVerifiedAt: new Date(),
      verification: "VERIFIED",
    },
  });

  await recordAudit({
    actor: { kind: "user", user: actor },
    action: "CREATE",
    entityType: "Person",
    entityId: person.id,
    entityLabel: person.legalName,
    newValue: { legalName: person.legalName },
    ip: clientIp(req.headers),
    userAgent: req.headers.get("user-agent"),
  });

  const settings = await getSettings();
  return ok({ person: redactPerson(person, "ADMIN", settings) }, 201);
});
