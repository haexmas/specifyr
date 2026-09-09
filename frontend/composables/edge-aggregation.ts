import type { Edge } from "specifyr";

export interface AggregatedEdge {
  /** Stable id: raw edge id when unchanged, `agg:${from}->${to}` when aggregated or deduped. */
  id: string;
  from: string;
  to: string;
  /** Number of raw edges this aggregate represents (>= 1). */
  count: number;
}

/**
 * Walk up the parent chain from `nodeId` until finding an id that is in
 * `visibleIds`. Returns `undefined` for an id that is unknown to
 * `parentOf` (defensive — the caller should not usually hit this).
 */
export function resolveVisibleEndpoint(
  nodeId: string,
  parentOf: ReadonlyMap<string, string | undefined>,
  visibleIds: ReadonlySet<string>,
): string | undefined {
  if (!parentOf.has(nodeId)) return undefined;
  let current: string | undefined = nodeId;
  while (current !== undefined) {
    if (visibleIds.has(current)) return current;
    current = parentOf.get(current);
  }
  return undefined;
}

/**
 * Every visible id along `nodeId`'s ancestor chain (including `nodeId`
 * itself when visible). The full chain matters for selection-adjacency
 * checks against aggregated edges: an edge landing at any ancestor of
 * the selection is "adjacent to" that selection — otherwise selecting
 * a deep symbol dims every cross-wrapper edge above it, because the
 * aggregate lives on an ancestor wrapper the selection is inside.
 */
export function visibleAncestors(
  nodeId: string,
  parentOf: ReadonlyMap<string, string | undefined>,
  visibleIds: ReadonlySet<string>,
): Set<string> {
  const result = new Set<string>();
  if (!parentOf.has(nodeId)) return result;
  let current: string | undefined = nodeId;
  while (current !== undefined) {
    if (visibleIds.has(current)) result.add(current);
    current = parentOf.get(current);
  }
  return result;
}

// A null byte can never appear in a real node id, so it's a safe separator
// for the (from, to) dedup key without risk of collision with any id content.
const KEY_SEP = "\0";

interface Bucket {
  from: string;
  to: string;
  rawId: string;
  rawFrom: string;
  rawTo: string;
  count: number;
}

/** Bottom-up ancestor chain (nodeId, parent, grandparent, ..., top-level). */
function ancestorChain(
  nodeId: string,
  parentOf: ReadonlyMap<string, string | undefined>,
): string[] {
  if (!parentOf.has(nodeId)) return [];
  const chain: string[] = [];
  let current: string | undefined = nodeId;
  while (current !== undefined) {
    chain.push(current);
    current = parentOf.get(current);
  }
  return chain;
}

/**
 * Aggregate raw edges to the level where source and target *diverge*
 * in the hierarchy: for each edge, find the two endpoints' lowest
 * common ancestor, then take the immediate child of that LCA on each
 * side. This keeps just enough resolution to answer "which subtree
 * of the shared parent connects to which sibling subtree" without
 * fanning back out into a bundle of parallel arrows when the caller
 * has drilled multiple levels deep on both sides.
 *
 * - Different top-level subtrees (no common ancestor): aggregate to
 *   the two top-level wrappers. Expanding a subfolder inside one of
 *   them never adds more cross-top-level arrows — they all collapse
 *   into the same top-level pair.
 * - Same top-level with a shared inner ancestor: aggregate to that
 *   ancestor's two children whose subtrees own the endpoints. A pair
 *   of siblings inside the same expanded folder stays as one arrow
 *   between them (both endpoints are the "children of LCA").
 *
 * If the derived endpoints are not themselves visible (e.g. the LCA's
 * child is inside a collapsed subtree), they are walked up to the
 * nearest visible ancestor. Same-endpoint results are dropped as
 * self-loops. Purely a rendering derivative — the raw `edges` array
 * is untouched.
 */
export function aggregateEdges(
  edges: readonly Edge[],
  parentOf: ReadonlyMap<string, string | undefined>,
  visibleIds: ReadonlySet<string>,
): AggregatedEdge[] {
  const buckets = new Map<string, Bucket>();
  for (const edge of edges) {
    const fromChain = ancestorChain(edge.from, parentOf);
    const toChain = ancestorChain(edge.to, parentOf);
    if (fromChain.length === 0 || toChain.length === 0) continue;

    // Walk both chains from the top-level end inward and stop at the
    // last matching ancestor — that is the LCA. The next slot on each
    // reversed chain (or the endpoint itself if the endpoint IS the
    // LCA) is the "child of LCA" we want as the aggregation endpoint.
    const fromRev = [...fromChain].reverse();
    const toRev = [...toChain].reverse();
    let lcaIdx = -1;
    const upper = Math.min(fromRev.length, toRev.length);
    for (let i = 0; i < upper; i += 1) {
      if (fromRev[i] === toRev[i]) lcaIdx = i;
      else break;
    }
    const fromKey = fromRev[lcaIdx + 1] ?? edge.from;
    const toKey = toRev[lcaIdx + 1] ?? edge.to;

    // Clamp each key to the nearest visible ancestor so a "child of
    // LCA" that itself sits inside a collapsed subtree resolves upward
    // to the visible wrapper the user actually sees on the canvas.
    const from = resolveVisibleEndpoint(fromKey, parentOf, visibleIds);
    const to = resolveVisibleEndpoint(toKey, parentOf, visibleIds);
    if (from === undefined || to === undefined) continue;
    if (from === to) continue;

    const key = `${from}${KEY_SEP}${to}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      buckets.set(key, {
        from,
        to,
        rawId: edge.id,
        rawFrom: edge.from,
        rawTo: edge.to,
        count: 1,
      });
    }
  }

  const out: AggregatedEdge[] = [];
  for (const bucket of buckets.values()) {
    const passthrough =
      bucket.count === 1 && bucket.rawFrom === bucket.from && bucket.rawTo === bucket.to;
    out.push({
      id: passthrough ? bucket.rawId : `agg:${bucket.from}->${bucket.to}`,
      from: bucket.from,
      to: bucket.to,
      count: bucket.count,
    });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}
