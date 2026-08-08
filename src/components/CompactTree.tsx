"use client";

import Link from "next/link";
import { useState } from "react";
import type { TreePerson } from "@/components/TreeCanvas";

type ShapeOnly = {
  order: string[];
  parents: Record<string, string[]>;
  children: Record<string, string[]>;
  spouses: Record<string, string[]>;
};

/**
 * The fallback that always works.
 *
 * On a large family, an old phone or a bad connection, the SVG canvas is the
 * wrong tool — so this is a plain indented list of names and links. It renders
 * instantly, reads correctly in a screen reader, and prints. It is not a
 * degraded mode so much as the honest one.
 */
export default function CompactTree({
  graph,
  people,
}: {
  graph: ShapeOnly;
  people: Record<string, TreePerson>;
}) {
  const [query, setQuery] = useState("");

  const roots = graph.order.filter(
    (id) => (graph.parents[id] ?? []).length === 0
  );

  const matches = (id: string) =>
    !query ||
    (people[id]?.name ?? "").toLowerCase().includes(query.toLowerCase());

  return (
    <div className="card p-4 sm:p-6">
      <label htmlFor="tree-filter" className="label">
        Find someone
      </label>
      <input
        id="tree-filter"
        className="field mb-5"
        placeholder="Type a name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <ul className="space-y-1">
        {roots.map((id) => (
          <Branch
            key={id}
            id={id}
            graph={graph}
            people={people}
            depth={0}
            seen={new Set()}
            matches={matches}
            filtering={!!query}
          />
        ))}
      </ul>
    </div>
  );
}

function Branch({
  id,
  graph,
  people,
  depth,
  seen,
  matches,
  filtering,
}: {
  id: string;
  graph: ShapeOnly;
  people: Record<string, TreePerson>;
  depth: number;
  seen: Set<string>;
  matches: (id: string) => boolean;
  filtering: boolean;
}) {
  // Somebody reachable by two routes is listed once, under the first.
  if (seen.has(id)) return null;
  seen.add(id);

  const person = people[id];
  if (!person) return null;

  const children = graph.children[id] ?? [];
  const spouses = (graph.spouses[id] ?? [])
    .map((s) => people[s]?.name)
    .filter(Boolean);

  const kids = children.map((childId) => (
    <Branch
      key={childId}
      id={childId}
      graph={graph}
      people={people}
      depth={depth + 1}
      seen={seen}
      matches={matches}
      filtering={filtering}
    />
  ));

  const selfMatches = matches(id);
  const anyChildRendered = kids.some(Boolean);
  if (filtering && !selfMatches && !anyChildRendered) return null;

  return (
    <li>
      <div
        className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-l-2 py-1.5 pl-3"
        style={{
          marginLeft: `${Math.min(depth, 6) * 14}px`,
          borderColor:
            depth === 0 ? "var(--color-terracotta)" : "var(--color-paper-3)",
        }}
      >
        <Link
          href={`/people/${id}`}
          className="font-semibold text-[var(--color-indigo-deep)] underline-offset-2 hover:underline"
        >
          {person.name}
        </Link>
        <span className="text-[0.85rem] text-[var(--color-ink-faint)]">
          {person.sub}
        </span>
        {spouses.length > 0 && (
          <span className="text-[0.85rem] text-[var(--color-ink-faint)]">
            · m. {spouses.join(", ")}
          </span>
        )}
        {person.isSeed && (
          <span className="chip bg-[var(--color-gold-soft)] text-[var(--color-gold)]">
            Sample
          </span>
        )}
      </div>
      {anyChildRendered && <ul>{kids}</ul>}
    </li>
  );
}
