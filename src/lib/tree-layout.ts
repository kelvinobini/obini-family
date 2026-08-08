import "server-only";
import type { FamilyGraph } from "@/lib/graph";
import { compareBirth } from "@/lib/graph";
import { NODE_H, NODE_W } from "@/lib/tree-types";
import type {
  FanLayout,
  FanSegment,
  TreeEdge,
  TreeLayout,
  TreeNode,
} from "@/lib/tree-types";

// Re-exported for server code that already imports from here.
export type { FanLayout, FanSegment, TreeEdge, TreeLayout, TreeNode };
export { NODE_H, NODE_W };

/**
 * ---------------------------------------------------------------------------
 * Tree geometry.
 *
 * Positions are computed on the server and shipped as plain numbers, so the
 * phone only has to draw. No layout library, no measuring pass, nothing that
 * has to run before the first paint — which is the difference between usable
 * and not on a mid-range Android over a patchy connection.
 * ---------------------------------------------------------------------------
 */

const H_GAP = 26;
const V_GAP = 92;

/**
 * Vertical descendant tree. Children hang below their parents; spouses sit
 * beside them; a parent is centred over the block of their children.
 */
export function buildDescendantTree(
  graph: FamilyGraph,
  rootId: string,
  maxDepth = 6
): TreeLayout {
  const nodes: TreeNode[] = [];
  const edges: TreeEdge[] = [];
  const placed = new Set<string>();

  /** Shifts a slice of already-placed nodes sideways. */
  const shift = (fromIndex: number, dx: number) => {
    for (let i = fromIndex; i < nodes.length; i++) nodes[i]!.x += dx;
  };

  /**
   * Places one person, their spouses and everything below them, starting at
   * `cursor`. Returns the total width consumed.
   */
  function place(id: string, depth: number, cursor: number): number {
    if (placed.has(id)) return 0;
    placed.add(id);

    const y = depth * (NODE_H + V_GAP);
    const startIndex = nodes.length;

    // Spouses ride alongside. Order polygynous households by household order,
    // then by when the marriage began.
    const spouseLinks = (graph.spouses.get(id) ?? [])
      .filter((s) => !placed.has(s.id))
      .sort((a, b) => (a.householdOrder ?? 99) - (b.householdOrder ?? 99));

    const group = [id, ...spouseLinks.map((s) => s.id)];
    for (const s of spouseLinks) {
      placed.add(s.id);
      edges.push({
        kind: "UNION",
        a: id,
        b: s.id,
        ended: !s.isCurrent,
        order: s.householdOrder,
      });
    }
    const groupWidth = group.length * NODE_W + (group.length - 1) * H_GAP;

    // Children of this person by any of their marriages, in birth order.
    const children =
      depth >= maxDepth
        ? []
        : [...new Set((graph.children.get(id) ?? []).map((c) => c.id))]
            .filter((c) => !placed.has(c))
            .sort((a, b) =>
              compareBirth(graph.people.get(a), graph.people.get(b))
            );

    // Leaf: just the group.
    if (children.length === 0) {
      group.forEach((memberId, i) => {
        nodes.push({
          id: memberId,
          x: cursor + i * (NODE_W + H_GAP) + NODE_W / 2,
          y,
          generation: depth,
          ...(i > 0
            ? {
                marriedInTo: id,
                unionId: spouseLinks[i - 1]?.unionId,
                unionEnded: !spouseLinks[i - 1]?.isCurrent,
              }
            : {}),
        });
      });
      return groupWidth;
    }

    // Lay the children out first, then centre the parents over them.
    const childIndex = nodes.length;
    let childCursor = cursor;
    for (const childId of children) {
      const used = place(childId, depth + 1, childCursor);
      if (used > 0) childCursor += used + H_GAP;

      for (const edge of graph.children.get(id) ?? []) {
        if (edge.id !== childId) continue;
        edges.push({ kind: "PARENT", from: id, to: childId, type: edge.type });
        // A child of a marriage descends from both partners.
        for (const spouse of spouseLinks) {
          const alsoTheirs = (graph.children.get(spouse.id) ?? []).find(
            (c) => c.id === childId
          );
          if (alsoTheirs) {
            edges.push({
              kind: "PARENT",
              from: spouse.id,
              to: childId,
              type: alsoTheirs.type,
            });
          }
        }
      }
    }
    const childrenWidth = Math.max(0, childCursor - cursor - H_GAP);
    const blockWidth = Math.max(groupWidth, childrenWidth);

    // Narrower children get nudged across to sit under the middle of the group.
    if (childrenWidth < blockWidth) {
      shift(childIndex, (blockWidth - childrenWidth) / 2);
    }

    const groupX = cursor + (blockWidth - groupWidth) / 2;
    const groupNodes: TreeNode[] = group.map((memberId, i) => ({
      id: memberId,
      x: groupX + i * (NODE_W + H_GAP) + NODE_W / 2,
      y,
      generation: depth,
      ...(i > 0
        ? {
            marriedInTo: id,
            unionId: spouseLinks[i - 1]?.unionId,
            unionEnded: !spouseLinks[i - 1]?.isCurrent,
          }
        : {}),
    }));
    // Parents belong before their children in the array so the SVG draws
    // connectors underneath the cards.
    nodes.splice(startIndex, 0, ...groupNodes);

    return blockWidth;
  }

  const totalWidth = place(rootId, 0, 0);

  const maxY = nodes.reduce((m, n) => Math.max(m, n.y), 0);
  return {
    nodes,
    edges: dedupeEdges(edges),
    width: Math.max(totalWidth, NODE_W) + NODE_W,
    height: maxY + NODE_H + 40,
    rootId,
    omitted: graph.people.size - placed.size,
  };
}

/**
 * Ancestor fan: the focus person at the centre, each generation of forebears
 * on a wider arc above them. Reads at a glance on a small screen, where a wide
 * pedigree chart does not.
 */
export function buildAncestorFan(
  graph: FamilyGraph,
  focusId: string,
  generations = 4
): FanLayout {
  const ringDepth = 62;
  const innerHole = 46;
  const radius = innerHole + generations * ringDepth;
  const width = radius * 2 + 40;
  const height = radius + 90;
  const centre = { x: width / 2, y: radius + 20 };

  const segments: FanSegment[] = [];

  /** Walks up one branch, splitting the arc between father and mother. */
  function walk(id: string, generation: number, start: number, end: number) {
    if (generation > generations) return;

    if (generation > 0) {
      const inner = innerHole + (generation - 1) * ringDepth;
      const outer = inner + ringDepth;
      const mid = (start + end) / 2;
      const labelRadius = (inner + outer) / 2;
      segments.push({
        id,
        generation,
        startAngle: start,
        endAngle: end,
        innerRadius: inner,
        outerRadius: outer,
        labelX: centre.x + Math.cos(mid) * labelRadius,
        labelY: centre.y - Math.sin(mid) * labelRadius,
        labelAngle: mid,
      });
    }

    const parents = graph.parents.get(id) ?? [];
    if (!parents.length) return;

    // Father on the left half, mother on the right, as pedigree charts read.
    const father = parents.find((p) => graph.people.get(p.id)?.gender === "MALE");
    const mother = parents.find((p) => graph.people.get(p.id)?.gender === "FEMALE");
    const rest = parents.filter((p) => p !== father && p !== mother);
    const ordered = [father, mother, ...rest].filter(Boolean).slice(0, 2) as {
      id: string;
    }[];
    if (!ordered.length) return;

    const slice = (end - start) / ordered.length;
    ordered.forEach((parent, i) => {
      walk(parent.id, generation + 1, start + i * slice, start + (i + 1) * slice);
    });
  }

  // Sweep the half-circle above the centre: π (west) round to 0 (east).
  walk(focusId, 0, Math.PI, 0);

  return { segments, centre, width, height, focusId };
}

function dedupeEdges(edges: TreeEdge[]): TreeEdge[] {
  const seen = new Set<string>();
  const out: TreeEdge[] = [];
  for (const e of edges) {
    const key =
      e.kind === "PARENT"
        ? `P:${e.from}:${e.to}:${e.type}`
        : `U:${[e.a, e.b].sort().join(":")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/**
 * The people at the top of the tree — those with no recorded parents. These
 * are the natural roots to draw from, and the list a family uses to navigate.
 */
export function rootAncestors(graph: FamilyGraph): string[] {
  const roots: string[] = [];
  for (const [id] of graph.people) {
    if ((graph.parents.get(id) ?? []).length === 0) {
      // Someone who married in and has no children of their own is not a root
      // worth offering — they would draw a tree of one.
      const hasChildren = (graph.children.get(id) ?? []).length > 0;
      if (hasChildren) roots.push(id);
    }
  }
  return roots.sort((a, b) =>
    compareBirth(graph.people.get(a), graph.people.get(b))
  );
}

/** The oldest recorded forebear on a person's line — the best default root. */
export function topAncestorOf(graph: FamilyGraph, id: string): string {
  let current = id;
  const seen = new Set([id]);
  for (let i = 0; i < 20; i++) {
    const parents = graph.parents.get(current) ?? [];
    const next = parents.find((p) => !seen.has(p.id));
    if (!next) break;
    seen.add(next.id);
    current = next.id;
  }
  return current;
}
