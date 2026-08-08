import type { Gender, ParentType, SiblingType, UnionEndReason } from "@prisma/client";

/**
 * The shape of a family, and the pure algorithms over it.
 *
 * Nothing here touches the database or the request. That is deliberate: the
 * relationship calculator and the tree layout are the two hardest pieces of
 * logic in the app, and keeping them pure means they can be run and checked on
 * their own — see scripts/check-relationships.ts, which builds a graph by hand
 * and asserts the answers without a database anywhere in sight.
 *
 * Loading a real family from Postgres lives in graph.ts, which is server-only.
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

/** Oldest first. Birth order beats a date, because families record it that way. */
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
  // Compare biological and adoptive lines only. A step-parent edge means one
  // of them was raised by someone the other wasn't; it does not make two
  // full siblings into half ones.
  const lineage = (id: string) =>
    new Set(
      (graph.parents.get(id) ?? [])
        .filter((p) => p.type === "BIOLOGICAL" || p.type === "ADOPTIVE")
        .map((p) => p.id)
    );
  const pa = lineage(a);
  const pb = lineage(b);
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
