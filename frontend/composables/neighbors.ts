import type { Edge, Node } from "specifyr";

export interface Neighbors {
  imports: Node[];
  importedBy: Node[];
  extends: Node[];
  extendedBy: Node[];
  /** `implements` is a reserved word in TS strict mode — field named `implementsList`. */
  implementsList: Node[];
  implementedBy: Node[];
}

/**
 * Direct (1-hop) neighbors of a node, bucketed by relationship type + direction.
 *
 * Dangling edges (endpoint not present in `nodes`) and self-loops are silently
 * skipped in every bucket. Each list is deduped by neighbor id and sorted by
 * node `name` ascending. Unknown edge types contribute to no bucket.
 */
export function neighborsOf(
  nodeId: string,
  nodes: readonly Node[],
  edges: readonly Edge[],
): Neighbors {
  const byId = new Map<string, Node>();
  for (const node of nodes) byId.set(node.id, node);

  const empty: Neighbors = {
    imports: [],
    importedBy: [],
    extends: [],
    extendedBy: [],
    implementsList: [],
    implementedBy: [],
  };
  if (!byId.has(nodeId)) return empty;

  const importIds = new Set<string>();
  const importedByIds = new Set<string>();
  const extendsIds = new Set<string>();
  const extendedByIds = new Set<string>();
  const implementsIds = new Set<string>();
  const implementedByIds = new Set<string>();

  for (const edge of edges) {
    let outBucket: Set<string> | undefined;
    let inBucket: Set<string> | undefined;
    switch (edge.type) {
      case "imports":
        outBucket = importIds;
        inBucket = importedByIds;
        break;
      case "extends":
        outBucket = extendsIds;
        inBucket = extendedByIds;
        break;
      case "implements":
        outBucket = implementsIds;
        inBucket = implementedByIds;
        break;
      default:
        continue;
    }
    if (edge.from === nodeId && edge.to !== nodeId && byId.has(edge.to)) {
      outBucket.add(edge.to);
    }
    if (edge.to === nodeId && edge.from !== nodeId && byId.has(edge.from)) {
      inBucket.add(edge.from);
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
    extends: toSortedNodes(extendsIds),
    extendedBy: toSortedNodes(extendedByIds),
    implementsList: toSortedNodes(implementsIds),
    implementedBy: toSortedNodes(implementedByIds),
  };
}
