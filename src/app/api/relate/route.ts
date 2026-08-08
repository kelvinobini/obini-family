import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { getActor, AuthError } from "@/lib/auth";
import { loadFamilyGraph } from "@/lib/graph";
import { describeRelationship } from "@/lib/relationships";

/**
 * "How am I related to you?" — two ids in, a sentence out.
 *
 * Defaults `from` to the signed-in relative, because that is the question
 * people actually ask.
 */
export const GET = handler(async (req: NextRequest) => {
  const actor = await getActor();
  if (!actor) throw new AuthError("Not signed in", 401);

  const params = req.nextUrl.searchParams;
  const from = params.get("from") ?? actor.personId;
  const to = params.get("to");

  if (!from || !to) {
    throw new AuthError("Pick two people to compare.", 422);
  }

  const [graph, terms] = await Promise.all([
    loadFamilyGraph(),
    db.kinshipTerm.findMany(),
  ]);

  const byCode = new Map<string, typeof terms>();
  for (const t of terms) {
    const list = byCode.get(t.code);
    if (list) list.push(t);
    else byCode.set(t.code, [t]);
  }

  const result = describeRelationship(graph, from, to, (code) =>
    (byCode.get(code) ?? []).map((t) => ({
      language: t.language,
      term: t.term,
      note: t.note,
    }))
  );

  const fromPerson = graph.people.get(from);
  const toPerson = graph.people.get(to);

  return ok({
    ...result,
    from: fromPerson ? { id: fromPerson.id, name: fromPerson.legalName } : null,
    to: toPerson ? { id: toPerson.id, name: toPerson.legalName } : null,
    /** Names along the path, so the UI can spell the connection out. */
    pathNames: result.path.map((id) => ({
      id,
      name: graph.people.get(id)?.legalName ?? "Someone",
    })),
  });
});
