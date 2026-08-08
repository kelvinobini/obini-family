import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getActor } from "@/lib/auth";
import { loadFamilyGraph } from "@/lib/graph";
import { describeRelationship } from "@/lib/relationships";

export const metadata: Metadata = { title: "How am I related?" };
export const dynamic = "force-dynamic";

/**
 * Two dropdowns and a sentence.
 *
 * Deliberately a plain GET form with no client JavaScript: it works on a slow
 * phone, it works with JS blocked, the answer is a shareable URL, and the back
 * button behaves. The whole page is server-rendered from one in-memory graph.
 */
export default async function RelatePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const actor = (await getActor())!;
  const params = await searchParams;

  const graph = await loadFamilyGraph();
  const people = [...graph.people.values()].sort((a, b) =>
    a.legalName.localeCompare(b.legalName)
  );

  const fromId = params.from ?? actor.personId ?? people[0]?.id ?? "";
  const toId = params.to ?? "";

  let result: Awaited<ReturnType<typeof describeRelationship>> | null = null;
  let terms: { language: string; term: string; note: string | null }[] = [];

  if (fromId && toId) {
    const kinshipTerms = await db.kinshipTerm.findMany();
    const byCode = new Map<string, typeof kinshipTerms>();
    for (const t of kinshipTerms) {
      const list = byCode.get(t.code);
      if (list) list.push(t);
      else byCode.set(t.code, [t]);
    }
    result = describeRelationship(graph, fromId, toId, (code) =>
      (byCode.get(code) ?? []).map((t) => ({
        language: t.language,
        term: t.term,
        note: t.note,
      }))
    );
    terms = result.culturalTerms;
  }

  const nameOf = (id: string) => graph.people.get(id)?.legalName ?? "Someone";

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">How am I related?</h1>
        <p className="mt-1 text-[var(--color-ink-soft)]">
          Pick any two people and we&apos;ll work out the connection.
        </p>
      </header>

      <form method="GET" className="card mb-6 space-y-4 p-5">
        <div>
          <label htmlFor="from" className="label">
            Start with
          </label>
          <select id="from" name="from" className="field" defaultValue={fromId}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.legalName}
                {p.id === actor.personId ? " (you)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="to" className="label">
            And find their relationship to
          </label>
          <select id="to" name="to" className="field" defaultValue={toId} required>
            <option value="">Choose someone…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.legalName}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="btn btn-primary w-full">
          Work it out
        </button>
      </form>

      {result && (
        <section className="card p-6">
          {result.found ? (
            <>
              <p className="prose-family text-xl">{result.plain}</p>

              {result.note && (
                <p className="mt-2 text-[var(--color-ink-soft)]">{result.note}</p>
              )}

              {terms.length > 0 && (
                <div className="mt-5 rounded-xl bg-[var(--color-gold-soft)] p-4">
                  <h2 className="mb-2 text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--color-gold)]">
                    In our own words
                  </h2>
                  <ul className="space-y-1.5">
                    {terms.map((t) => (
                      <li key={`${t.language}-${t.term}`}>
                        <span className="font-serif text-lg font-semibold">
                          {t.term}
                        </span>
                        <span className="ml-2 text-[0.9rem] text-[var(--color-ink-soft)]">
                          {t.language}
                          {t.note ? ` — ${t.note}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.path.length > 1 && (
                <div className="mt-5">
                  <h2 className="mb-2 text-[0.85rem] font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
                    The line between them
                  </h2>
                  <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
                    {result.path.map((id, i) => (
                      <li key={`${id}-${i}`} className="flex items-center gap-1.5">
                        {i > 0 && (
                          <span aria-hidden className="text-[var(--color-ink-faint)]">
                            →
                          </span>
                        )}
                        <Link
                          href={`/people/${id}`}
                          className="chip border border-[var(--color-paper-3)] bg-white text-[var(--color-indigo-deep)]"
                        >
                          {nameOf(id)}
                        </Link>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                <Link href={`/people/${toId}`} className="btn btn-secondary">
                  Open {nameOf(toId).split(" ")[0]}&apos;s page
                </Link>
                <Link href={`/tree?focus=${toId}`} className="btn btn-secondary">
                  See on the tree
                </Link>
                {/* Swapping tells you the other half of the answer: an uncle's
                    nephew, not another uncle. */}
                <Link
                  href={`/relate?from=${toId}&to=${fromId}`}
                  className="btn btn-quiet"
                >
                  Turn it around
                </Link>
              </div>
            </>
          ) : (
            <p className="prose-family">{result.plain}</p>
          )}
        </section>
      )}
    </div>
  );
}
