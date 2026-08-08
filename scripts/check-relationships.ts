/**
 * Checks the relationship calculator against the sample family, without
 * touching a database.
 *
 * describeRelationship() is a pure function over a FamilyGraph, so the graph
 * can be built by hand here. That means the hardest logic in the app — the
 * part that has to get half-siblings, adoption, remarriage and in-laws right —
 * is verifiable on its own, rather than only after a deploy.
 *
 * Run with:  npx tsx scripts/check-relationships.ts
 */

import type { FamilyGraph, GraphPerson } from "../src/lib/graph-core";
import { describeRelationship } from "../src/lib/relationships";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

type Def = {
  id: string;
  name: string;
  gender: "MALE" | "FEMALE";
  born: Date;
  deceased?: boolean;
};

// The same shape as prisma/seed.ts.
const DEFS: Def[] = [
  { id: "nnamdi", name: "Nnamdi Obini", gender: "MALE", born: utc(1931, 4, 12), deceased: true },
  { id: "adaeze", name: "Adaeze Obini", gender: "FEMALE", born: utc(1936, 8, 2), deceased: true },
  { id: "ifeoma", name: "Ifeoma Obini", gender: "FEMALE", born: utc(1948, 1, 22) },
  { id: "emeka", name: "Chukwuemeka Obini", gender: "MALE", born: utc(1962, 6, 30) },
  { id: "ngozi", name: "Ngozi Eze", gender: "FEMALE", born: utc(1965, 3, 14) },
  { id: "obiageli", name: "Obiageli Obini", gender: "FEMALE", born: utc(1984, 9, 9) },
  { id: "tunde", name: "Tunde Eze", gender: "MALE", born: utc(1961, 12, 5) },
  { id: "amaka", name: "Amaka Obini", gender: "FEMALE", born: utc(1968, 7, 19) },
  { id: "chidi", name: "Chidi Obini", gender: "MALE", born: utc(1993, 5, 21) },
  { id: "zainab", name: "Zainab Obini", gender: "FEMALE", born: utc(1998, 2, 11) },
  { id: "emekajnr", name: "Emeka Eze", gender: "MALE", born: utc(1991, 10, 2) },
  { id: "kelechi", name: "Kelechi Eze", gender: "FEMALE", born: utc(1995, 4, 8) },
  { id: "chiamaka", name: "Chiamaka Obini", gender: "FEMALE", born: utc(2016, 1, 30) },
];

// parent, child, type
const PARENTS: [string, string, string][] = [
  ["nnamdi", "emeka", "BIOLOGICAL"],
  ["adaeze", "emeka", "BIOLOGICAL"],
  ["nnamdi", "ngozi", "BIOLOGICAL"],
  ["adaeze", "ngozi", "BIOLOGICAL"],
  // Half-sister: shares only Nnamdi.
  ["nnamdi", "obiageli", "BIOLOGICAL"],
  ["ifeoma", "obiageli", "BIOLOGICAL"],
  // Step-parent edges alongside the biological ones.
  ["ifeoma", "emeka", "STEP"],
  ["ifeoma", "ngozi", "STEP"],
  ["emeka", "chidi", "BIOLOGICAL"],
  ["amaka", "chidi", "BIOLOGICAL"],
  // The adoption.
  ["emeka", "zainab", "ADOPTIVE"],
  ["amaka", "zainab", "ADOPTIVE"],
  ["tunde", "emekajnr", "BIOLOGICAL"],
  ["ngozi", "emekajnr", "BIOLOGICAL"],
  ["tunde", "kelechi", "BIOLOGICAL"],
  ["ngozi", "kelechi", "BIOLOGICAL"],
  ["chidi", "chiamaka", "BIOLOGICAL"],
];

// a, b, current, endReason
const UNIONS: [string, string, boolean, string | null][] = [
  ["nnamdi", "adaeze", false, "DEATH"],
  ["nnamdi", "ifeoma", true, null],
  ["tunde", "ngozi", true, null],
  ["emeka", "amaka", true, null],
];

function buildGraph(): FamilyGraph {
  const graph: FamilyGraph = {
    people: new Map(),
    parents: new Map(),
    children: new Map(),
    spouses: new Map(),
    explicitSiblings: new Map(),
  };

  for (const d of DEFS) {
    graph.people.set(d.id, {
      id: d.id,
      legalName: d.name,
      nickname: null,
      nativeName: null,
      gender: d.gender,
      birthDate: d.born,
      birthOrder: null,
      isDeceased: !!d.deceased,
      privacyLevel: "NORMAL",
      nameOnly: false,
    } as GraphPerson);
  }

  const push = <T>(map: Map<string, T[]>, key: string, value: T) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };

  for (const [parent, child, type] of PARENTS) {
    push(graph.parents, child, { id: parent, type: type as never, unionId: null });
    push(graph.children, parent, { id: child, type: type as never, unionId: null });
  }

  for (const [a, b, current, endReason] of UNIONS) {
    const shared = {
      unionId: `${a}-${b}`,
      isCurrent: current,
      endReason: endReason as never,
      householdOrder: null,
    };
    push(graph.spouses, a, { id: b, ...shared });
    push(graph.spouses, b, { id: a, ...shared });
  }

  // Children in birth order, as loadFamilyGraph does.
  for (const [, list] of graph.children) {
    list.sort(
      (x, y) =>
        (graph.people.get(x.id)!.birthDate!.getTime() ?? 0) -
        (graph.people.get(y.id)!.birthDate!.getTime() ?? 0)
    );
  }

  return graph;
}

// ---------------------------------------------------------------------------

type Case = { from: string; to: string; expectTerm: string; why: string };

const CASES: Case[] = [
  { from: "chidi", to: "emeka", expectTerm: "father", why: "the simplest case" },
  { from: "chidi", to: "nnamdi", expectTerm: "paternal grandfather", why: "two generations up, and the side matters" },
  { from: "nnamdi", to: "chidi", expectTerm: "grandson", why: "the same link, read downward" },
  { from: "chidi", to: "zainab", expectTerm: "younger sister", why: "ADOPTION — an adopted sibling is a sibling" },
  { from: "chidi", to: "emekajnr", expectTerm: "first cousin", why: "cousins through Nnamdi" },
  { from: "chidi", to: "ngozi", expectTerm: "paternal aunt", why: "father's younger sister" },
  { from: "emeka", to: "obiageli", expectTerm: "half-younger sister", why: "HALF-SIBLING — shares Nnamdi only, not Adaeze" },
  { from: "emeka", to: "ngozi", expectTerm: "younger sister", why: "full siblings — shares both parents" },
  { from: "chidi", to: "obiageli", expectTerm: "paternal aunt", why: "a half-aunt is still an aunt" },
  { from: "nnamdi", to: "adaeze", expectTerm: "late wife", why: "REMARRIAGE — the first marriage ended in death" },
  { from: "nnamdi", to: "ifeoma", expectTerm: "wife", why: "the second marriage is current" },
  { from: "ifeoma", to: "adaeze", expectTerm: "co-wife", why: "both married to Nnamdi" },
  { from: "chidi", to: "chiamaka", expectTerm: "daughter", why: "one generation down" },
  { from: "chiamaka", to: "nnamdi", expectTerm: "paternal great-grandfather", why: "three generations up" },
  { from: "ngozi", to: "amaka", expectTerm: "sister-in-law", why: "IN-LAW — brother's wife" },
  { from: "chidi", to: "tunde", expectTerm: "relative", why: "uncle by marriage — no single English word, so the chain carries it" },
];

const graph = buildGraph();
let passed = 0;
let failed = 0;

console.log("\nRelationship calculator — sample family\n" + "─".repeat(72));

for (const c of CASES) {
  const r = describeRelationship(graph, c.from, c.to);
  const ok = r.term === c.expectTerm;
  ok ? passed++ : failed++;

  const fromName = graph.people.get(c.from)!.legalName;
  const toName = graph.people.get(c.to)!.legalName;

  console.log(
    `\n${ok ? "PASS" : "FAIL"}  ${fromName} → ${toName}\n` +
      `      ${c.why}\n` +
      `      says:   ${r.plain}` +
      (ok ? "" : `\n      wanted term: "${c.expectTerm}", got: "${r.term}"`)
  );
}

console.log("\n" + "─".repeat(72));
console.log(`${passed} passed, ${failed} failed, ${CASES.length} total\n`);
process.exit(failed === 0 ? 0 : 1);
