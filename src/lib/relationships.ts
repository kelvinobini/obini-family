// Imported from graph-core, not graph: this file is pure logic and must stay
// runnable outside Next, so it can be checked without a database.
import type { FamilyGraph, GraphPerson } from "@/lib/graph-core";
import {
  ancestorsOf,
  compareBirth,
  isFullSibling,
  siblingsOf,
} from "@/lib/graph-core";

/**
 * ---------------------------------------------------------------------------
 * "How am I related to you?"
 *
 * Two answers are produced for every pair, because they are different things:
 *
 *   the chain — "your father's elder brother's daughter", which is how a family
 *               actually explains itself, and
 *   the term  — "your first cousin", the single word an anthropologist or a
 *               form would use.
 *
 * A path through blood is always preferred to a path through marriage, so
 * two people who are both cousins and in-laws are told they are cousins.
 * ---------------------------------------------------------------------------
 */

export type EdgeKind = "PARENT" | "CHILD" | "SPOUSE" | "SIBLING";

export type PathStep = {
  from: string;
  to: string;
  kind: EdgeKind;
  /** BIOLOGICAL / ADOPTIVE / STEP / FOSTER / GUARDIAN, for parent and child steps. */
  variant?: string;
};

export type RelationshipResult = {
  found: boolean;
  /** "your father's elder brother's daughter" */
  chain: string;
  /** "first cousin" */
  term: string;
  /** Stable key for looking up the family's own word for this. */
  code: string;
  /** "your father's elder brother's daughter — your first cousin" */
  plain: string;
  culturalTerms: { language: string; term: string; note: string | null }[];
  /** Person ids in order, for highlighting the connection on the tree. */
  path: string[];
  steps: PathStep[];
  /** Generations up to the common ancestor, and back down. */
  degrees: { up: number; down: number } | null;
  note: string | null;
};

// ---------------------------------------------------------------------------
// Path finding
// ---------------------------------------------------------------------------

function neighbours(
  graph: FamilyGraph,
  id: string,
  includeMarriage: boolean
): PathStep[] {
  const out: PathStep[] = [];

  for (const p of graph.parents.get(id) ?? []) {
    out.push({ from: id, to: p.id, kind: "PARENT", variant: p.type });
  }
  for (const c of graph.children.get(id) ?? []) {
    out.push({ from: id, to: c.id, kind: "CHILD", variant: c.type });
  }
  for (const s of graph.explicitSiblings.get(id) ?? []) {
    out.push({ from: id, to: s.id, kind: "SIBLING", variant: s.type });
  }
  if (!includeMarriage) return out;

  const married: PathStep[] = (graph.spouses.get(id) ?? []).map((s) => ({
    from: id,
    to: s.id,
    kind: "SPOUSE" as const,
  }));

  // This pass only runs once we know the two are not blood relatives, so the
  // marriage is the meaningful link and gets explored first. Otherwise two
  // co-wives get joined through a step-child — "your step-son's mother" —
  // when what they actually are is wives of the same husband.
  return [...married, ...out];
}

function findPath(
  graph: FamilyGraph,
  fromId: string,
  toId: string,
  includeMarriage: boolean,
  maxDepth = 14
): PathStep[] | null {
  if (fromId === toId) return [];

  const previous = new Map<string, PathStep>();
  const seen = new Set([fromId]);
  let frontier = [fromId];
  let depth = 0;

  while (frontier.length && depth < maxDepth) {
    depth += 1;
    const next: string[] = [];
    for (const current of frontier) {
      for (const step of neighbours(graph, current, includeMarriage)) {
        if (seen.has(step.to)) continue;
        seen.add(step.to);
        previous.set(step.to, step);
        if (step.to === toId) {
          // Walk the predecessors back to the start.
          const steps: PathStep[] = [];
          let cursor = toId;
          while (cursor !== fromId) {
            const s = previous.get(cursor)!;
            steps.unshift(s);
            cursor = s.from;
          }
          return steps;
        }
        next.push(step.to);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * A father→child hop through a shared parent is really one sibling step, and
 * that is how a family says it: "your father's brother", not "your father's
 * father's son".
 */
function collapseSiblingSteps(steps: PathStep[]): PathStep[] {
  const out: PathStep[] = [];
  let i = 0;
  while (i < steps.length) {
    const a = steps[i]!;
    const b = steps[i + 1];
    if (a.kind === "PARENT" && b?.kind === "CHILD" && b.to !== a.from) {
      out.push({ from: a.from, to: b.to, kind: "SIBLING" });
      i += 2;
      continue;
    }
    out.push(a);
    i += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Naming a single step
// ---------------------------------------------------------------------------

function pick(gender: string, male: string, female: string, neutral: string): string {
  if (gender === "MALE") return male;
  if (gender === "FEMALE") return female;
  return neutral;
}

function seniority(
  graph: FamilyGraph,
  subject: GraphPerson,
  relativeTo: GraphPerson
): "elder" | "younger" | null {
  const order = compareBirth(subject, relativeTo);
  if (order === 0) return null;
  // compareBirth sorts oldest first, so a negative result means born earlier.
  return order < 0 ? "elder" : "younger";
}

function nameStep(
  graph: FamilyGraph,
  step: PathStep,
  isFirst: boolean
): string {
  const from = graph.people.get(step.from);
  const to = graph.people.get(step.to);
  if (!to) return "relative";

  const g = to.gender;
  let phrase: string;

  switch (step.kind) {
    case "PARENT": {
      const base = pick(g, "father", "mother", "parent");
      phrase =
        step.variant === "STEP"
          ? `step-${base}`
          : step.variant === "ADOPTIVE"
            ? `adoptive ${base}`
            : step.variant === "FOSTER"
              ? `foster ${base}`
              : step.variant === "GUARDIAN"
                ? "guardian"
                : base;
      break;
    }
    case "CHILD": {
      const base = pick(g, "son", "daughter", "child");
      phrase =
        step.variant === "STEP"
          ? `step-${base}`
          : step.variant === "ADOPTIVE"
            ? `adopted ${base}`
            : step.variant === "FOSTER"
              ? `foster ${base}`
              : step.variant === "GUARDIAN"
                ? "ward"
                : base;
      break;
    }
    case "SPOUSE": {
      phrase = pick(g, "husband", "wife", "spouse");
      break;
    }
    case "SIBLING": {
      const base = pick(g, "brother", "sister", "sibling");
      const rank = from ? seniority(graph, to, from) : null;
      const half =
        step.variant === "HALF" ||
        (from && !isFullSibling(graph, step.from, step.to) &&
          (graph.parents.get(step.from)?.length ?? 0) > 0 &&
          (graph.parents.get(step.to)?.length ?? 0) > 0)
          ? "half-"
          : step.variant === "STEP"
            ? "step-"
            : "";
      phrase = `${half}${rank ? `${rank} ` : ""}${base}`;
      break;
    }
  }

  return isFirst ? `your ${phrase}` : phrase;
}

// ---------------------------------------------------------------------------
// The canonical term
// ---------------------------------------------------------------------------

const ORDINALS = [
  "first", "second", "third", "fourth", "fifth",
  "sixth", "seventh", "eighth", "ninth", "tenth",
];

function greats(n: number, base: string): string {
  if (n <= 0) return base;
  if (n === 1) return `great-${base}`;
  return `${"great-".repeat(n)}${base}`;
}

function removedPhrase(n: number): string {
  if (n === 0) return "";
  if (n === 1) return " once removed";
  if (n === 2) return " twice removed";
  if (n === 3) return " three times removed";
  return ` ${n} times removed`;
}

/** Which side of the family the connection runs through. */
function lineageSide(steps: PathStep[], graph: FamilyGraph): "paternal" | "maternal" | null {
  const first = steps[0];
  if (!first || first.kind !== "PARENT") return null;
  const parent = graph.people.get(first.to);
  if (!parent) return null;
  if (parent.gender === "MALE") return "paternal";
  if (parent.gender === "FEMALE") return "maternal";
  return null;
}

type BloodTerm = { term: string; code: string; degrees: { up: number; down: number } };

function bloodTerm(
  graph: FamilyGraph,
  fromId: string,
  toId: string,
  steps: PathStep[]
): BloodTerm | null {
  const target = graph.people.get(toId);
  if (!target) return null;
  const g = target.gender;

  const aAncestors = ancestorsOf(graph, fromId);
  const bAncestors = ancestorsOf(graph, toId);

  // Direct line down: they are our descendant.
  const asDescendant = bAncestors.get(fromId);
  if (asDescendant !== undefined) {
    const d = asDescendant;
    if (d === 1) {
      return {
        term: pick(g, "son", "daughter", "child"),
        code: pick(g, "SON", "DAUGHTER", "CHILD"),
        degrees: { up: 0, down: 1 },
      };
    }
    const base = pick(g, "grandson", "granddaughter", "grandchild");
    return {
      term: greats(d - 2, base),
      code: `${"GREAT_".repeat(d - 2)}${pick(g, "GRANDSON", "GRANDDAUGHTER", "GRANDCHILD")}`,
      degrees: { up: 0, down: d },
    };
  }

  // Direct line up: they are our ancestor.
  const asAncestor = aAncestors.get(toId);
  if (asAncestor !== undefined) {
    const d = asAncestor;
    if (d === 1) {
      return {
        term: pick(g, "father", "mother", "parent"),
        code: pick(g, "FATHER", "MOTHER", "PARENT"),
        degrees: { up: 1, down: 0 },
      };
    }
    const side = lineageSide(steps, graph);
    const base = pick(g, "grandfather", "grandmother", "grandparent");
    const term = greats(d - 2, base);
    return {
      term: side ? `${side} ${term}` : term,
      code:
        `${side ? `${side.toUpperCase()}_` : ""}` +
        `${"GREAT_".repeat(d - 2)}${pick(g, "GRANDFATHER", "GRANDMOTHER", "GRANDPARENT")}`,
      degrees: { up: d, down: 0 },
    };
  }

  // Off to one side: find the nearest shared ancestor.
  let best: { id: string; up: number; down: number } | null = null;
  for (const [id, up] of aAncestors) {
    const down = bAncestors.get(id);
    if (down === undefined) continue;
    if (!best || up + down < best.up + best.down) best = { id, up, down };
  }

  // No shared ancestor recorded, but an explicit sibling link may still exist.
  if (!best) {
    if (siblingsOf(graph, fromId).includes(toId)) {
      return {
        term: pick(g, "brother", "sister", "sibling"),
        code: pick(g, "BROTHER", "SISTER", "SIBLING"),
        degrees: { up: 1, down: 1 },
      };
    }
    return null;
  }

  const { up, down } = best;
  const side = lineageSide(steps, graph);

  // Siblings.
  if (up === 1 && down === 1) {
    const full = isFullSibling(graph, fromId, toId);
    const rank = seniority(graph, target, graph.people.get(fromId)!);
    const base = pick(g, "brother", "sister", "sibling");
    const label = `${full ? "" : "half-"}${rank ? `${rank} ` : ""}${base}`;
    return {
      term: label,
      code:
        `${full ? "" : "HALF_"}${rank ? `${rank.toUpperCase()}_` : ""}` +
        pick(g, "BROTHER", "SISTER", "SIBLING"),
      degrees: { up, down },
    };
  }

  // Their sibling's descendants: nephew, niece, grand-nephew.
  if (up === 1) {
    const base = pick(g, "nephew", "niece", "nibling");
    return {
      term: down === 2 ? base : greats(down - 3, `grand-${base}`),
      code: `${"GREAT_".repeat(Math.max(0, down - 3))}${down === 2 ? "" : "GRAND_"}${pick(g, "NEPHEW", "NIECE", "NIBLING")}`,
      degrees: { up, down },
    };
  }

  // Their parent's sibling: uncle, aunt, great-uncle.
  if (down === 1) {
    const base = pick(g, "uncle", "aunt", "parent's sibling");
    const label = up === 2 ? base : greats(up - 3, `great-${base}`);
    const rank =
      up === 2
        ? (() => {
            // Elder or younger than the parent they are sibling to?
            const parentId = steps[0]?.kind === "PARENT" ? steps[0].to : null;
            const parent = parentId ? graph.people.get(parentId) : null;
            return parent ? seniority(graph, target, parent) : null;
          })()
        : null;
    // Seniority is left out of the English term — "younger aunt" is not
    // English — but kept in the code, because it is exactly the distinction a
    // family's own kinship terms turn on (Dede nna is specifically the
    // father's ELDER brother). The chain still says "your father's younger
    // sister", so nothing is lost.
    return {
      term: `${side ? `${side} ` : ""}${label}`,
      code:
        `${side ? `${side.toUpperCase()}_` : ""}${rank ? `${rank.toUpperCase()}_` : ""}` +
        `${up === 2 ? "" : "GREAT_".repeat(up - 2)}${pick(g, "UNCLE", "AUNT", "PARENTS_SIBLING")}`,
      degrees: { up, down },
    };
  }

  // Cousins.
  const degree = Math.min(up, down) - 1;
  const removed = Math.abs(up - down);
  const ordinal = ORDINALS[degree - 1] ?? `${degree}th`;
  return {
    term: `${ordinal} cousin${removedPhrase(removed)}`,
    code: `COUSIN_${degree}_REMOVED_${removed}`,
    degrees: { up, down },
  };
}

// ---------------------------------------------------------------------------
// In-laws and marriage
// ---------------------------------------------------------------------------

function marriageTerm(
  graph: FamilyGraph,
  fromId: string,
  steps: PathStep[]
): { term: string; code: string; note: string | null } | null {
  const target = graph.people.get(steps[steps.length - 1]!.to);
  if (!target) return null;
  const g = target.gender;
  const kinds = steps.map((s) => s.kind);

  // Spouse.
  if (steps.length === 1 && kinds[0] === "SPOUSE") {
    const union = (graph.spouses.get(fromId) ?? []).find((s) => s.id === target.id);
    const past = union && !union.isCurrent;
    const widowed = union?.endReason === "DEATH";
    const base = pick(g, "husband", "wife", "spouse");
    return {
      term: widowed ? `late ${base}` : past ? `former ${base}` : base,
      code: pick(g, "HUSBAND", "WIFE", "SPOUSE"),
      note: widowed
        ? "This marriage ended when they passed."
        : past
          ? "This marriage has ended."
          : null,
    };
  }

  // Co-wife / co-husband: two people married to the same person.
  if (steps.length === 2 && kinds[0] === "SPOUSE" && kinds[1] === "SPOUSE") {
    const shared = graph.people.get(steps[0]!.to);
    return {
      term: pick(g, "co-husband", "co-wife", "co-spouse"),
      code: pick(g, "CO_HUSBAND", "CO_WIFE", "CO_SPOUSE"),
      note: shared ? `Both married to ${shared.legalName}.` : null,
    };
  }

  // Your spouse's parent.
  if (steps.length === 2 && kinds[0] === "SPOUSE" && kinds[1] === "PARENT") {
    return {
      term: pick(g, "father-in-law", "mother-in-law", "parent-in-law"),
      code: pick(g, "FATHER_IN_LAW", "MOTHER_IN_LAW", "PARENT_IN_LAW"),
      note: null,
    };
  }

  // Your child's spouse.
  if (steps.length === 2 && kinds[0] === "CHILD" && kinds[1] === "SPOUSE") {
    return {
      term: pick(g, "son-in-law", "daughter-in-law", "child-in-law"),
      code: pick(g, "SON_IN_LAW", "DAUGHTER_IN_LAW", "CHILD_IN_LAW"),
      note: null,
    };
  }

  // Your spouse's sibling, or your sibling's spouse — both are "in-law".
  if (
    steps.length === 2 &&
    ((kinds[0] === "SPOUSE" && kinds[1] === "SIBLING") ||
      (kinds[0] === "SIBLING" && kinds[1] === "SPOUSE"))
  ) {
    return {
      term: pick(g, "brother-in-law", "sister-in-law", "sibling-in-law"),
      code: pick(g, "BROTHER_IN_LAW", "SISTER_IN_LAW", "SIBLING_IN_LAW"),
      note: null,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------

export type CulturalTermLookup = (code: string) => {
  language: string;
  term: string;
  note: string | null;
}[];

export function describeRelationship(
  graph: FamilyGraph,
  fromId: string,
  toId: string,
  lookupCultural?: CulturalTermLookup
): RelationshipResult {
  const empty: RelationshipResult = {
    found: false,
    chain: "",
    term: "",
    code: "",
    plain: "",
    culturalTerms: [],
    path: [],
    steps: [],
    degrees: null,
    note: null,
  };

  if (!graph.people.has(fromId) || !graph.people.has(toId)) return empty;

  if (fromId === toId) {
    return {
      ...empty,
      found: true,
      chain: "yourself",
      term: "the same person",
      code: "SELF",
      plain: "That's the same person.",
      path: [fromId],
    };
  }

  // Prefer blood, so two people who are both cousins and in-laws are told they
  // are cousins.
  //
  // But "a path exists that avoids marriage" is NOT the same as "they are blood
  // relatives". A husband and wife are joined through their own child —
  // father → son → son's mother — which avoids every SPOUSE edge while being
  // pure affinity. So the test is whether the blood path actually yields a
  // blood term; if it doesn't, we fall back to the route through marriage,
  // which is usually shorter and always more honest.
  const bloodSteps = findPath(graph, fromId, toId, false);
  const blood = bloodSteps
    ? bloodTerm(graph, fromId, toId, collapseSiblingSteps(bloodSteps))
    : null;

  const rawSteps = blood ? bloodSteps : (findPath(graph, fromId, toId, true) ?? bloodSteps);

  if (!rawSteps) {
    return {
      ...empty,
      plain:
        "We can't trace a connection between these two yet. That usually means " +
        "a parent or a marriage hasn't been recorded — not that they aren't related.",
    };
  }

  const steps = collapseSiblingSteps(rawSteps);
  const path = [fromId, ...steps.map((s) => s.to)];

  const chain = steps
    .map((step, i) => nameStep(graph, step, i === 0))
    .join("'s ");

  const inLaw = blood ? null : marriageTerm(graph, fromId, steps);

  const term = blood?.term ?? inLaw?.term ?? "relative";
  const code = blood?.code ?? inLaw?.code ?? "RELATIVE";
  const note = inLaw?.note ?? null;

  // If the chain and the term say exactly the same thing ("your father" and
  // "father"), don't repeat ourselves.
  const chainIsTerm = chain.replace(/^your /, "") === term;
  const plain = chainIsTerm
    ? `Your ${term}.`
    : `${capitalise(chain)} — your ${term}.`;

  return {
    found: true,
    chain,
    term,
    code,
    plain,
    culturalTerms: lookupCultural ? lookupCultural(code) : [],
    path,
    steps,
    degrees: blood?.degrees ?? null,
    note,
  };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
