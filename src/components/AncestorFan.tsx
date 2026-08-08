"use client";

import { useRouter } from "next/navigation";
import type { FanLayout } from "@/lib/tree-layout";
import type { TreePerson } from "@/components/TreeCanvas";

/**
 * Ancestors as a fan: the focus person at the hub, each generation of
 * forebears on a wider arc. It fits a phone screen where a wide pedigree chart
 * does not, and it makes an incomplete line obvious — a missing parent is a
 * visible gap in the ring rather than an absence you have to notice.
 */
export default function AncestorFan({
  layout,
  people,
}: {
  layout: FanLayout;
  people: Record<string, TreePerson>;
}) {
  const router = useRouter();
  const focus = people[layout.focusId];

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--color-paper-3)] bg-white p-3">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="mx-auto h-auto w-full max-w-3xl"
        role="img"
        aria-label={`Ancestors of ${focus?.name ?? "this person"}`}
      >
        {layout.segments.map((seg) => {
          const person = people[seg.id];
          if (!person) return null;
          const flip = Math.cos(seg.labelAngle) < 0;
          return (
            <g
              key={`${seg.id}-${seg.generation}`}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`${person.name}, ${ordinalGeneration(seg.generation)}`}
              onClick={() => router.push(`/people/${seg.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/people/${seg.id}`);
                }
              }}
            >
              <path
                d={arcPath(
                  layout.centre,
                  seg.innerRadius,
                  seg.outerRadius,
                  seg.startAngle,
                  seg.endAngle
                )}
                fill={RING_FILL[Math.min(seg.generation, RING_FILL.length - 1)]}
                stroke="#fff"
                strokeWidth={2}
              />
              <text
                x={seg.labelX}
                y={seg.labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={seg.generation > 2 ? 9.5 : 11.5}
                fontWeight={600}
                fill="var(--color-ink)"
                transform={`rotate(${
                  (flip ? -seg.labelAngle + Math.PI : -seg.labelAngle) *
                  (180 / Math.PI)
                } ${seg.labelX} ${seg.labelY})`}
              >
                {truncate(person.name, seg.generation > 2 ? 14 : 18)}
              </text>
            </g>
          );
        })}

        {/* The hub. */}
        <circle
          cx={layout.centre.x}
          cy={layout.centre.y}
          r={44}
          fill="var(--color-indigo-deep)"
        />
        <text
          x={layout.centre.x}
          y={layout.centre.y - 4}
          textAnchor="middle"
          fontSize={12}
          fontWeight={700}
          fill="#fff"
        >
          {truncate(focus?.name.split(" ")[0] ?? "You", 11)}
        </text>
        <text
          x={layout.centre.x}
          y={layout.centre.y + 12}
          textAnchor="middle"
          fontSize={9.5}
          fill="var(--color-indigo-soft)"
        >
          {focus?.name.split(" ").slice(1).join(" ").slice(0, 14) || ""}
        </text>
      </svg>
    </div>
  );
}

const RING_FILL = [
  "var(--color-indigo-soft)",
  "var(--color-indigo-soft)",
  "var(--color-sage-soft)",
  "var(--color-gold-soft)",
  "var(--color-terracotta-soft)",
];

/** Annular sector between two radii and two angles. */
function arcPath(
  centre: { x: number; y: number },
  r1: number,
  r2: number,
  a1: number,
  a2: number
): string {
  const p = (r: number, a: number) => ({
    x: centre.x + Math.cos(a) * r,
    y: centre.y - Math.sin(a) * r,
  });
  const large = Math.abs(a1 - a2) > Math.PI ? 1 : 0;
  const outerStart = p(r2, a1);
  const outerEnd = p(r2, a2);
  const innerEnd = p(r1, a2);
  const innerStart = p(r1, a1);
  // Angles decrease as the fan sweeps west to east, so both arcs are clockwise.
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${r2} ${r2} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${r1} ${r1} 0 ${large} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

function ordinalGeneration(n: number): string {
  if (n === 1) return "parent";
  if (n === 2) return "grandparent";
  return `${"great-".repeat(n - 2)}grandparent`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
