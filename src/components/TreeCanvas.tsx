"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  NODE_H,
  NODE_W,
  type TreeEdge,
  type TreeNode,
  type TreePerson,
} from "@/lib/tree-types";

export type { TreePerson };

/**
 * Pan and zoom over an SVG the server already positioned.
 *
 * Pointer events cover mouse, touch and stylus in one path, so there is no
 * separate touch branch to get wrong. Nothing here depends on hover, and every
 * card is a real button — the tree is reachable by keyboard and screen reader
 * as well as by thumb.
 */
export default function TreeCanvas({
  nodes,
  edges,
  people,
  width,
  height,
  focusId,
  highlightPath = [],
}: {
  nodes: TreeNode[];
  edges: TreeEdge[];
  people: Record<string, TreePerson>;
  width: number;
  height: number;
  focusId?: string | null;
  highlightPath?: string[];
}) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.85);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const byId = useCallback((id: string) => nodes.find((n) => n.id === id), [nodes]);
  const highlighted = new Set(highlightPath);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset({
      x: drag.current.ox + (e.clientX - drag.current.x),
      y: drag.current.oy + (e.clientY - drag.current.y),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const zoom = (delta: number) =>
    setScale((s) => Math.min(2, Math.max(0.25, Number((s + delta).toFixed(2)))));

  const reset = () => {
    setScale(0.85);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="relative">
      <div
        ref={container}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative h-[70dvh] touch-none overflow-hidden rounded-2xl border border-[var(--color-paper-3)] bg-white"
        style={{ cursor: drag.current ? "grabbing" : "grab" }}
      >
        <svg
          width={width * scale}
          height={height * scale}
          viewBox={`0 0 ${width} ${height}`}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            transformOrigin: "0 0",
          }}
          role="tree"
          aria-label="Family tree"
        >
          {/* Connectors, drawn first so cards sit on top of them. */}
          <g>
            {edges.map((edge, i) => {
              if (edge.kind === "UNION") {
                const a = byId(edge.a);
                const b = byId(edge.b);
                if (!a || !b) return null;
                return (
                  <line
                    key={`u${i}`}
                    x1={a.x}
                    y1={a.y + NODE_H / 2}
                    x2={b.x}
                    y2={b.y + NODE_H / 2}
                    stroke="var(--color-terracotta)"
                    strokeWidth={2.5}
                    // A marriage that ended is drawn broken, not deleted.
                    strokeDasharray={edge.ended ? "6 5" : undefined}
                  />
                );
              }
              const from = byId(edge.from);
              const to = byId(edge.to);
              if (!from || !to) return null;
              const midY = from.y + NODE_H + (to.y - from.y - NODE_H) / 2;
              return (
                <path
                  key={`p${i}`}
                  d={`M ${from.x} ${from.y + NODE_H} V ${midY} H ${to.x} V ${to.y}`}
                  fill="none"
                  stroke={
                    highlighted.has(edge.from) && highlighted.has(edge.to)
                      ? "var(--color-terracotta)"
                      : "var(--color-indigo)"
                  }
                  strokeWidth={
                    highlighted.has(edge.from) && highlighted.has(edge.to) ? 3.5 : 1.8
                  }
                  strokeOpacity={edge.type === "BIOLOGICAL" ? 0.75 : 0.55}
                  // Adoption, step and guardianship are real but different, and
                  // the line says so without a legend.
                  strokeDasharray={edge.type === "BIOLOGICAL" ? undefined : "5 4"}
                />
              );
            })}
          </g>

          {nodes.map((node) => {
            const person = people[node.id];
            if (!person) return null;
            const isFocus = node.id === focusId;
            const onPath = highlighted.has(node.id);
            return (
              <g
                key={node.id}
                data-node
                role="treeitem"
                tabIndex={0}
                aria-label={`${person.name}. ${person.sub}`}
                className="cursor-pointer"
                onClick={() => router.push(`/people/${node.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/people/${node.id}`);
                  }
                }}
              >
                <rect
                  x={node.x - NODE_W / 2}
                  y={node.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={12}
                  fill={person.deceased ? "var(--color-paper-2)" : "#fff"}
                  stroke={
                    isFocus
                      ? "var(--color-terracotta)"
                      : onPath
                        ? "var(--color-gold)"
                        : "var(--color-paper-3)"
                  }
                  strokeWidth={isFocus || onPath ? 3 : 1.5}
                />
                {/* A quiet colour band, not a pink/blue stereotype: it marks
                    the line the person continues, which is what a tree is for. */}
                <rect
                  x={node.x - NODE_W / 2}
                  y={node.y}
                  width={4}
                  height={NODE_H}
                  rx={2}
                  fill={
                    person.gender === "MALE"
                      ? "var(--color-indigo)"
                      : person.gender === "FEMALE"
                        ? "var(--color-sage)"
                        : "var(--color-gold)"
                  }
                />
                <text
                  x={node.x}
                  y={node.y + 28}
                  textAnchor="middle"
                  fontSize={14.5}
                  fontWeight={600}
                  fill="var(--color-ink)"
                >
                  {truncate(person.name, 18)}
                </text>
                <text
                  x={node.x}
                  y={node.y + 48}
                  textAnchor="middle"
                  fontSize={12}
                  fill="var(--color-ink-faint)"
                >
                  {truncate(person.sub, 22)}
                </text>
                {person.isSeed && (
                  <text
                    x={node.x}
                    y={node.y + 66}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill="var(--color-gold)"
                  >
                    SAMPLE
                  </text>
                )}
                {person.limited && (
                  <text
                    x={node.x + NODE_W / 2 - 12}
                    y={node.y + 18}
                    textAnchor="middle"
                    fontSize={12}
                    aria-label="Private profile"
                  >
                    🔒
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Controls sit outside the canvas so a drag never fights a tap. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => zoom(0.15)} className="btn btn-secondary" aria-label="Zoom in">
          Bigger
        </button>
        <button onClick={() => zoom(-0.15)} className="btn btn-secondary" aria-label="Zoom out">
          Smaller
        </button>
        <button onClick={reset} className="btn btn-quiet">
          Recentre
        </button>
        <span className="ml-auto text-[0.85rem] text-[var(--color-ink-faint)]">
          Drag to move · tap anyone to open them
        </span>
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
