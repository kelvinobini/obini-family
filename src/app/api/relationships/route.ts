import { NextRequest } from "next/server";
import { z } from "zod";
import { handler, ok } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { assertRole } from "@/lib/authz";
import { parentChildInput, siblingInput, unionInput } from "@/lib/validation";
import {
  createParentChildRecord,
  createSiblingRecord,
  createUnionRecord,
  removeRelationship,
  type RelationshipKind,
} from "@/lib/relationship-writes";

/**
 * Relationships are structural: they change what other people's records say
 * about them, so only an admin writes them directly. Members — including for
 * their own profile — send a NEW_RELATIONSHIP suggestion instead.
 */
export const POST = handler(async (req: NextRequest) => {
  const actor = await getActor();
  assertRole(actor, "relationship:write");

  const body = await req.json();
  const kind = z.enum(["UNION", "PARENT_CHILD", "SIBLING"]).parse(body.kind);
  const auditActor = { kind: "user" as const, user: actor };

  if (kind === "UNION") {
    const union = await createUnionRecord(unionInput.parse(body), auditActor);
    return ok({ kind, id: union.id }, 201);
  }
  if (kind === "PARENT_CHILD") {
    const edge = await createParentChildRecord(parentChildInput.parse(body), auditActor);
    return ok({ kind, id: edge.id }, 201);
  }
  const link = await createSiblingRecord(siblingInput.parse(body), auditActor);
  return ok({ kind, id: link.id }, 201);
});

export const DELETE = handler(async (req: NextRequest) => {
  const actor = await getActor();
  assertRole(actor, "relationship:write");

  const kind = z
    .enum(["UNION", "PARENT_CHILD", "SIBLING"])
    .parse(req.nextUrl.searchParams.get("kind")) as RelationshipKind;
  const id = z.string().min(1).parse(req.nextUrl.searchParams.get("id"));

  await removeRelationship(kind, id, { kind: "user", user: actor });
  return ok({ ok: true });
});
