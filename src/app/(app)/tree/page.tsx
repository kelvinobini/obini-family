import Link from "next/link";
import type { Metadata } from "next";
import { getActor } from "@/lib/auth";
import { loadFamilyGraph } from "@/lib/graph";
import {
  buildAncestorFan,
  buildDescendantTree,
  rootAncestors,
  topAncestorOf,
} from "@/lib/tree-layout";
import { lifespan } from "@/lib/dates";
import { db } from "@/lib/db";
import TreeCanvas from "@/components/TreeCanvas";
import type { TreePerson } from "@/lib/tree-types";
import AncestorFan from "@/components/AncestorFan";
import CompactTree from "@/components/CompactTree";

export const metadata: Metadata = { title: "The tree" };
export const dynamic = "force-dynamic";

type View = "tree" | "fan" | "list";

export default async function TreePage({
  searchParams,
}: {
  searchParams: Promise<{ root?: string; focus?: string; view?: string }>;
}) {
  const actor = (await getActor())!;
  const params = await searchParams;
  const view = (params.view ?? "tree") as View;

  const graph = await loadFamilyGraph();

  if (graph.people.size === 0) {
    return <EmptyTree isAdmin={actor.role === "ADMIN"} />;
  }

  const focusId = params.focus ?? actor.personId ?? null;
  const roots = rootAncestors(graph);
  const rootId =
    params.root ??
    (focusId ? topAncestorOf(graph, focusId) : null) ??
    roots[0] ??
    [...graph.people.keys()][0]!;

  // Full records only for the dates; names come from the graph.
  const details = await db.person.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      birthDate: true,
      birthPrecision: true,
      birthDateText: true,
      deathDate: true,
      deathPrecision: true,
      deathDateText: true,
      isDeceased: true,
      isSeed: true,
      privacyLevel: true,
      nameOnly: true,
    },
  });

  const people: Record<string, TreePerson> = {};
  for (const d of details) {
    const g = graph.people.get(d.id);
    if (!g) continue;
    const limited = d.privacyLevel === "LIMITED" || d.nameOnly;
    people[d.id] = {
      id: d.id,
      name: g.legalName,
      // A limited profile still appears in the tree — that is the whole point
      // of "limited" rather than "hidden" — but says nothing further.
      sub: limited ? "Details private" : lifespan(d),
      deceased: d.isDeceased,
      gender: g.gender,
      limited,
      isSeed: d.isSeed,
    };
  }

  const layout = buildDescendantTree(graph, rootId, 6);
  const fan = focusId ? buildAncestorFan(graph, focusId, 4) : null;

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">The family tree</h1>
        <p className="mt-1 text-[var(--color-ink-soft)]">
          {graph.people.size} people recorded.{" "}
          {layout.omitted > 0 && (
            <>
              {layout.omitted} sit on another branch —{" "}
              <Link href="/tree?view=list" className="underline">
                see everyone in a list
              </Link>
              .
            </>
          )}
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["tree", "Descendants"],
            ["fan", "Ancestors"],
            ["list", "Simple list"],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={`/tree?view=${key}${params.root ? `&root=${params.root}` : ""}${
              focusId ? `&focus=${focusId}` : ""
            }`}
            className={`chip border px-3 py-2 ${
              view === key
                ? "border-[var(--color-indigo-deep)] bg-[var(--color-indigo-soft)] text-[var(--color-indigo-deep)]"
                : "border-[var(--color-paper-3)] bg-white text-[var(--color-ink-soft)]"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {view === "list" && <CompactTree graph={serialiseGraph(graph)} people={people} />}

      {view === "fan" &&
        (fan && fan.segments.length > 0 ? (
          <AncestorFan layout={fan} people={people} />
        ) : (
          <p className="card p-6 text-[var(--color-ink-soft)]">
            We haven&apos;t recorded any parents for{" "}
            {focusId ? people[focusId]?.name ?? "this person" : "you"} yet, so
            there&apos;s no fan to draw. Add a mother or father and it will
            appear here.
          </p>
        ))}

      {view === "tree" && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[0.9rem] font-semibold text-[var(--color-ink-soft)]">
              Starting from:
            </span>
            {roots.slice(0, 6).map((id) => (
              <Link
                key={id}
                href={`/tree?root=${id}${focusId ? `&focus=${focusId}` : ""}`}
                className={`chip border px-3 py-1.5 ${
                  id === rootId
                    ? "border-[var(--color-terracotta)] bg-[var(--color-terracotta-soft)] text-[var(--color-terracotta)]"
                    : "border-[var(--color-paper-3)] bg-white text-[var(--color-ink-soft)]"
                }`}
              >
                {people[id]?.name ?? "Someone"}
              </Link>
            ))}
          </div>

          <TreeCanvas
            nodes={layout.nodes}
            edges={layout.edges}
            people={people}
            width={layout.width}
            height={layout.height}
            focusId={focusId}
          />

          <div className="mt-4 flex flex-wrap gap-4 text-[0.85rem] text-[var(--color-ink-faint)]">
            <span>
              <span className="inline-block h-0.5 w-6 bg-[var(--color-indigo)] align-middle" />{" "}
              by birth
            </span>
            <span>
              <span className="inline-block h-0.5 w-6 border-t-2 border-dashed border-[var(--color-indigo)] align-middle" />{" "}
              adopted, step or in care
            </span>
            <span>
              <span className="inline-block h-0.5 w-6 bg-[var(--color-terracotta)] align-middle" />{" "}
              married
            </span>
            <span>
              <span className="inline-block h-0.5 w-6 border-t-2 border-dashed border-[var(--color-terracotta)] align-middle" />{" "}
              marriage ended
            </span>
          </div>
        </>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/print/tree" className="btn btn-secondary">
          Print or save as a poster
        </Link>
        <Link href="/relate" className="btn btn-secondary">
          How am I related to someone?
        </Link>
      </div>
    </div>
  );
}

/** The compact list needs the shape of the family, not the whole graph object. */
function serialiseGraph(graph: Awaited<ReturnType<typeof loadFamilyGraph>>) {
  return {
    order: [...graph.people.keys()],
    parents: Object.fromEntries(
      [...graph.parents].map(([k, v]) => [k, v.map((p) => p.id)])
    ),
    children: Object.fromEntries(
      [...graph.children].map(([k, v]) => [k, v.map((c) => c.id)])
    ),
    spouses: Object.fromEntries(
      [...graph.spouses].map(([k, v]) => [k, v.map((s) => s.id)])
    ),
  };
}

function EmptyTree({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      <h1 className="mb-2 text-2xl font-semibold">Nobody here yet</h1>
      <p className="mb-6 text-[var(--color-ink-soft)]">
        This is where the family will appear. The tree grows from one person —
        usually the oldest relative anyone can name.
      </p>
      {isAdmin ? (
        <Link href="/people/new" className="btn btn-primary">
          Add the first person
        </Link>
      ) : (
        <p className="text-[var(--color-ink-faint)]">
          Ask the family admin to make a start.
        </p>
      )}
    </div>
  );
}
