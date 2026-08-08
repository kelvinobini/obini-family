import type { ParentType } from "@prisma/client";

/**
 * Geometry and shapes shared by the server (which computes the layout) and the
 * browser (which draws it).
 *
 * This file must never import anything server-only. tree-layout.ts reaches
 * into the database-backed graph, so a client component importing from it —
 * even for a type — drags Prisma into the browser bundle and fails the build.
 * Everything the canvas needs lives here instead.
 */

export const NODE_W = 150;
export const NODE_H = 78;

export type TreeNode = {
  /** Centre of the card. */
  x: number;
  y: number;
  id: string;
  generation: number;
  /** Set when this card is only here as somebody's husband or wife. */
  marriedInTo?: string;
  unionId?: string;
  /** The marriage ended — drawn with a broken line. */
  unionEnded?: boolean;
};

export type TreeEdge =
  | { kind: "PARENT"; from: string; to: string; type: ParentType }
  | { kind: "UNION"; a: string; b: string; ended: boolean; order: number | null };

export type TreeLayout = {
  nodes: TreeNode[];
  edges: TreeEdge[];
  width: number;
  height: number;
  rootId: string;
  /** People the walk never reached, so the UI can offer them honestly. */
  omitted: number;
};

export type FanSegment = {
  id: string;
  generation: number;
  /** Radians, measured from due west, sweeping over the top. */
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  labelX: number;
  labelY: number;
  labelAngle: number;
};

export type FanLayout = {
  segments: FanSegment[];
  centre: { x: number; y: number };
  width: number;
  height: number;
  focusId: string;
};

/** What the canvas needs to draw one person — never their private fields. */
export type TreePerson = {
  id: string;
  name: string;
  sub: string;
  deceased: boolean;
  gender: "MALE" | "FEMALE" | "OTHER" | "UNKNOWN";
  limited: boolean;
  isSeed: boolean;
};
