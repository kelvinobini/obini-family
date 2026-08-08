import "server-only";
import { db } from "@/lib/db";
import { compareBirth, type FamilyGraph, type GraphPerson } from "@/lib/graph-core";

/**
 * Loads the whole family into memory as a graph.
 *
 * A family is small — hundreds of people, not millions — so every query that
 * needs to reason about shape (the tree layout, the relationship calculator,
 * generation filters) works over one in-memory graph rather than a pile of
 * recursive SQL. One round trip, then pure functions.
 *
 * The shape and the algorithms live in graph-core.ts, which has no database
 * dependency and can therefore be tested on its own.
 */

export * from "@/lib/graph-core";

export async function loadFamilyGraph(): Promise<FamilyGraph> {
  const [people, parentEdges, unions, siblingLinks] = await Promise.all([
    db.person.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        legalName: true,
        nickname: true,
        nativeName: true,
        gender: true,
        birthDate: true,
        birthOrder: true,
        isDeceased: true,
        privacyLevel: true,
        nameOnly: true,
      },
      orderBy: { legalName: "asc" },
    }),
    db.parentChild.findMany({
      where: { deletedAt: null },
      select: { parentId: true, childId: true, type: true, unionId: true },
    }),
    db.union.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        partnerAId: true,
        partnerBId: true,
        isCurrent: true,
        endReason: true,
        householdOrder: true,
      },
    }),
    db.siblingLink.findMany({
      where: { deletedAt: null },
      select: { aId: true, bId: true, type: true },
    }),
  ]);

  const graph: FamilyGraph = {
    people: new Map(people.map((p) => [p.id, p as GraphPerson])),
    parents: new Map(),
    children: new Map(),
    spouses: new Map(),
    explicitSiblings: new Map(),
  };

  const push = <T>(map: Map<string, T[]>, key: string, value: T) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };

  for (const e of parentEdges) {
    if (!graph.people.has(e.parentId) || !graph.people.has(e.childId)) continue;
    push(graph.parents, e.childId, {
      id: e.parentId,
      type: e.type,
      unionId: e.unionId,
    });
    push(graph.children, e.parentId, {
      id: e.childId,
      type: e.type,
      unionId: e.unionId,
    });
  }

  for (const u of unions) {
    if (!graph.people.has(u.partnerAId) || !graph.people.has(u.partnerBId)) continue;
    const shared = {
      unionId: u.id,
      isCurrent: u.isCurrent,
      endReason: u.endReason,
      householdOrder: u.householdOrder,
    };
    push(graph.spouses, u.partnerAId, { id: u.partnerBId, ...shared });
    push(graph.spouses, u.partnerBId, { id: u.partnerAId, ...shared });
  }

  for (const s of siblingLinks) {
    if (!graph.people.has(s.aId) || !graph.people.has(s.bId)) continue;
    push(graph.explicitSiblings, s.aId, { id: s.bId, type: s.type });
    push(graph.explicitSiblings, s.bId, { id: s.aId, type: s.type });
  }

  // Children in birth order wherever we know it; it is how families actually
  // list themselves, and the tree reads wrong otherwise.
  for (const [, list] of graph.children) {
    list.sort((a, b) => compareBirth(graph.people.get(a.id), graph.people.get(b.id)));
  }

  return graph;
}
