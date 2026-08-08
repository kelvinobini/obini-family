import "server-only";
import { db } from "@/lib/db";
import type { Gender, ParentType, SiblingType, UnionEndReason } from "@prisma/client";

/**
 * The whole family, loaded into memory as a graph.
 *
 * A family is small — hundreds of people, not millions — so every query that
 * needs to reason about shape (the tree layout, the relationship calculator,
 * generation filters) works over one in-memory graph rather than a pile of
 * recursive SQL. One round trip, then pure functions.
 */

export type GraphPerson = {
  id: string;
  legalName: string;
  nickname: string | null;
  nativeName: string | null;
  gender: Gender;
  birthDate: Date | null;
  birthOrder: number | null;
  isDeceased: boolean;
  privacyLevel: "NORMAL" | "LIMITED";
  nameOnly: boolean;
};

export type ParentEdge = { id: string; type: ParentType; unionId: string | null };
export type SpouseEdge = {
  id: string;
  unionId: string;
  isCurrent: boolean;
  endReason: UnionEndReason | null;
  householdOrder: number | null;
};
export type SiblingEdge = { id: string; type: SiblingType };

export type FamilyGraph = {
  people: Map<string, GraphPerson>;
  /** person -> their parents */
  parents: Map<string, ParentEdge[]>;
  /** person -> their children */
  children: Map<string, ParentEdge[]>;
  spouses: Map<string, SpouseEdge[]>;
  /** Only siblings asserted directly, where no shared parent is recorded. */
  explicitSiblings: Map<string, SiblingEdge[]>;
};

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

export function compareBirth(
  a: GraphPerson | undefined,
  b: GraphPerson | undefined
): number {
  if (!a || !b) return 0;
  if (a.birthOrder != null && b.birthOrder != null) return a.birthOrder - b.birthOrder;
  if (a.birthDate && b.birthDate) return a.birthDate.getTime() - b.birthDate.getTime();
  if (a.birthDate) return -1;
  if (b.birthDate) return 1;
  return a.legalName.localeCompare(b.legalName);
}

/** Everyone sharing at least one recorded parent, plus asserted siblings. */
export function siblingsOf(graph: FamilyGraph, id: string): string[] {
  const found = new Set<string>();
  for (const parent of graph.parents.get(id) ?? []) {
    for (const child of graph.children.get(parent.id) ?? []) {
      if (child.id !== id) found.add(child.id);
    }
  }
  for (const s of graph.explicitSiblings.get(id) ?? []) found.add(s.id);
  return [...found].sort((a, b) =>
    compareBirth(graph.people.get(a), graph.people.get(b))
  );
}

/** True when the two share every recorded parent — full rather than half. */
export function isFullSibling(graph: FamilyGraph, a: string, b: string): boolean {
  const pa = new Set((graph.parents.get(a) ?? []).map((p) => p.id));
  const pb = new Set((graph.parents.get(b) ?? []).map((p) => p.id));
  if (pa.size === 0 || pb.size === 0) return false;
  if (pa.size !== pb.size) return false;
  for (const id of pa) if (!pb.has(id)) return false;
  return true;
}

/** Ancestors with their distance in generations. */
export function ancestorsOf(
  graph: FamilyGraph,
  id: string,
  maxDepth = 12
): Map<string, number> {
  const found = new Map<string, number>();
  let frontier = [id];
  let depth = 0;
  const seen = new Set([id]);

  while (frontier.length && depth < maxDepth) {
    depth += 1;
    const next: string[] = [];
    for (const current of frontier) {
      for (const parent of graph.parents.get(current) ?? []) {
        if (seen.has(parent.id)) continue;
        seen.add(parent.id);
        found.set(parent.id, depth);
        next.push(parent.id);
      }
    }
    frontier = next;
  }
  return found;
}

export function descendantsOf(
  graph: FamilyGraph,
  id: string,
  maxDepth = 12
): Map<string, number> {
  const found = new Map<string, number>();
  let frontier = [id];
  let depth = 0;
  const seen = new Set([id]);

  while (frontier.length && depth < maxDepth) {
    depth += 1;
    const next: string[] = [];
    for (const current of frontier) {
      for (const child of graph.children.get(current) ?? []) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        found.set(child.id, depth);
        next.push(child.id);
      }
    }
    frontier = next;
  }
  return found;
}

/**
 * Generation number relative to the oldest recorded ancestor, used by the
 * directory's "generation" filter. Lower is older.
 */
export function generationOf(graph: FamilyGraph, id: string): number {
  const ancestors = ancestorsOf(graph, id);
  let deepest = 0;
  for (const depth of ancestors.values()) deepest = Math.max(deepest, depth);
  return deepest;
}

export function displayName(p: GraphPerson | undefined): string {
  if (!p) return "Someone";
  return p.legalName;
}
