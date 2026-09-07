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
const NODE_WIDTH = 220;
const NODE_HEIGHT = 60;

export interface ElkGraphInput {
  id: "root";
  layoutOptions: Record<string, string>;
  children: Array<{ id: string; width: number; height: number }>;
  edges: Array<{ id: string; sources: string[]; targets: string[] }>;
}

export function modelToElkGraph(input: AdapterInput): ElkGraphInput {
  const ids = new Set(input.nodes.map((n) => n.id));
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
    },
    children: input.nodes.map((n) => ({
      id: n.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
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
  for (const child of result.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }
  return positions;
}
