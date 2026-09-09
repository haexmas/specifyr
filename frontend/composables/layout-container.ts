import ELK from "elkjs/lib/elk.bundled.js";

import {
  type AdapterEdge,
  type AdapterNode,
  type SizeOf,
  elkResultToPositions,
  modelToElkGraph,
} from "./elk-adapter.js";

export interface ContainerLayoutInput {
  nodes: AdapterNode[];
  edges: AdapterEdge[];
  /**
   * Per-node measured size. Defaults to the constant NODE_WIDTH/NODE_HEIGHT
   * used by the current flat layout when a size is missing — same semantic
   * as `modelToElkGraph`'s constants today. The nested composable
   * overrides these per child (badge size vs. expanded-cell size).
   */
  sizeOf?: SizeOf;
}

export interface ContainerLayoutOutput {
  /** Absolute positions relative to the container's own top-left. */
  positions: Map<string, { x: number; y: number }>;
  /** Overall bounding box ELK produced for the children. */
  contentSize: { width: number; height: number };
}

interface ElkChild {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/**
 * Single ELK `.layout()` call over a flat child set. Pure with respect to
 * the caller — no Vue reactivity, no cached instance state; a fresh ELK
 * instance is created per call. Suitable for both the top-level flat
 * layout (via `useElkLayout`) and the per-container nested layout (via
 * `useNestedElkLayout`).
 */
export async function layoutContainer(
  input: ContainerLayoutInput,
): Promise<ContainerLayoutOutput> {
  const elk = new ELK();
  const graph = modelToElkGraph({ nodes: input.nodes, edges: input.edges }, input.sizeOf);
  // elkjs's ElkNode/ElkExtendedEdge types are structurally compatible with our
  // adapter output, but the generic self-reference in ELK.layout confuses TS.
  // Cast the call site only — our own types stay strict.
  const laidOut = await elk.layout(graph as unknown as Parameters<typeof elk.layout>[0]);
  const positions = elkResultToPositions(laidOut);

  let width = 0;
  let height = 0;
  for (const child of (laidOut.children ?? []) as ElkChild[]) {
    const right = (child.x ?? 0) + (child.width ?? 0);
    const bottom = (child.y ?? 0) + (child.height ?? 0);
    if (right > width) width = right;
    if (bottom > height) height = bottom;
  }

  return {
    positions,
    contentSize: { width, height },
  };
}
