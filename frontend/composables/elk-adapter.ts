// Pure conversion between our Model shape and ELK's graph JSON schema.
// Kept dependency-free so it can be unit-tested without spinning up ELK.

export interface AdapterNode {
  id: string;
  label: string;
}

export interface AdapterEdge {
  id: string;
  from: string;
  to: string;
}

export interface AdapterInput {
  nodes: AdapterNode[];
  edges: AdapterEdge[];
}

// Match what pages/index.vue will feed to Vue Flow. Small enough that
// layered fits the graph without excessive crossing; big enough to render
// the two-line "name\n(type)" label without truncation.
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 60;

export interface ElkGraphInput {
  id: "root";
  layoutOptions: Record<string, string>;
  children: Array<{ id: string; width: number; height: number }>;
  edges: Array<{ id: string; sources: string[]; targets: string[] }>;
}

/**
 * Per-node measured size lookup. Return `undefined` (or omit the callback)
 * to fall back to the module-level NODE_WIDTH/NODE_HEIGHT defaults used by
 * the flat top-level layout. The nested layout overrides these per child
 * (badge size vs. expanded-cell size).
 */
export type SizeOf = (nodeId: string) => { width: number; height: number } | undefined;

export function modelToElkGraph(input: AdapterInput, sizeOf?: SizeOf): ElkGraphInput {
  const ids = new Set(input.nodes.map((n) => n.id));
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
    },
    children: input.nodes.map((n) => {
      const size = sizeOf?.(n.id);
      return {
        id: n.id,
        width: size?.width ?? NODE_WIDTH,
        height: size?.height ?? NODE_HEIGHT,
      };
    }),
    // Edge ids come pre-deduped from Slice B (extractIst's `${from}::${to}::type`
    // gate). If a later slice emits duplicates, ELK will reject them with an
    // error — surface it, don't silently paper over.
    edges: input.edges
      .filter((e) => ids.has(e.from) && ids.has(e.to))
      .map((e) => ({
        id: e.id,
        sources: [e.from],
        targets: [e.to],
      })),
  };
}

export interface ElkResultNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface ElkResultGraph {
  id: string;
  children?: ElkResultNode[];
}

export function elkResultToPositions(
  result: ElkResultGraph,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  // If ELK failed to position a child (should not happen with the `layered`
  // algorithm on well-formed input), it renders at origin — nodes stack. We
  // intentionally do not warn here to keep the module pure and dep-free; a
  // future dev-only diagnostic could live in the composable.
  // We only walk top-level children — this slice never produces hierarchical
  // graphs (no ELK groups / compound nodes). A later slice adding hierarchy
  // would need to recurse.
  for (const child of result.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }
  return positions;
}
