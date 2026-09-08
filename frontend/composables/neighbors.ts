import type { Edge, Node } from "specifyr";

export interface Neighbors {
  imports: Node[];
  importedBy: Node[];
}

/**
 * Direct (1-hop) import neighbors of a node.
 *
 * Only `type === "imports"` edges are considered. Dangling edges (endpoint
 * not present in `nodes`) and self-loops are silently skipped. Each list is
 * deduped by neighbor id and sorted by node `name` ascending.
 *
 * Runs in O(nodes + edges) — a `Map<string, Node>` is built once per call.
 */
export function neighborsOf(
  nodeId: string,
  nodes: readonly Node[],
  edges: readonly Edge[],
): Neighbors {
  const byId = new Map<string, Node>();
  for (const node of nodes) {
    byId.set(node.id, node);
  }

  const importIds = new Set<string>();
  const importedByIds = new Set<string>();
  for (const edge of edges) {
    if (edge.type !== "imports") continue;
    if (edge.from === nodeId && edge.to !== nodeId && byId.has(edge.to)) {
      importIds.add(edge.to);
    }
    if (edge.to === nodeId && edge.from !== nodeId && byId.has(edge.from)) {
      importedByIds.add(edge.from);
    }
  }

  const toSortedNodes = (ids: Set<string>): Node[] => {
    const out: Node[] = [];
    for (const id of ids) {
      const node = byId.get(id);
      if (node) out.push(node);
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  };

  return {
    imports: toSortedNodes(importIds),
    importedBy: toSortedNodes(importedByIds),
  };
}
