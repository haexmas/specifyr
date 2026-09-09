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
 * The enclosing visible wrapper of `nodeId` — the visible container
 * that `nodeId` sits *inside*, never `nodeId` itself unless it is
 * top-level. Used to bundle cross-container edges up to the wrapper
 * level so N parallel arrows from siblings of the same folder to the
 * same target collapse into one arrow between the folder and that
 * target. A top-level id has no enclosing container, so this returns
 * that id itself — it is already the coarsest possible endpoint.
 */
export function enclosingVisibleWrapper(
  nodeId: string,
  parentOf: ReadonlyMap<string, string | undefined>,
  visibleIds: ReadonlySet<string>,
): string | undefined {
  if (!parentOf.has(nodeId)) return undefined;
  const parent = parentOf.get(nodeId);
  if (parent === undefined) return nodeId;
  let current: string | undefined = parent;
  while (current !== undefined) {
    if (visibleIds.has(current)) return current;
    current = parentOf.get(current);
  }
  return undefined;
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

/**
 * Aggregate raw edges into canvas-visible edges using a two-tier rule:
 *
 * - **Cross-wrapper edges** (both endpoints live in *different*
 *   enclosing visible wrappers) collapse to a single wrapper→wrapper
 *   edge. Every raw edge crossing the same pair of wrappers dedupes
 *   into one `AggregatedEdge` whose `count` reflects how many raw
 *   edges backed it. This is what bundles N parallel arrows from
 *   siblings of a folder to the same target into one folder→target
 *   arrow — a folder that imports something from `src` shows one edge,
 *   not one per file inside it.
 * - **Intra-wrapper edges** (both endpoints live in the *same*
 *   enclosing wrapper) keep their raw endpoints so the internal
 *   structure of an expanded wrapper stays visible at file/symbol
 *   granularity. Raw endpoints must themselves be visible; otherwise
 *   the edge is dropped (self-loop from aggregation).
 *
 * An edge whose either endpoint is unknown (no entry in `parentOf`,
 * so `enclosingVisibleWrapper` returns `undefined`) is silently
 * dropped. Purely a rendering derivative — the raw `edges` array is
 * untouched.
 */
export function aggregateEdges(
  edges: readonly Edge[],
  parentOf: ReadonlyMap<string, string | undefined>,
  visibleIds: ReadonlySet<string>,
): AggregatedEdge[] {
  const buckets = new Map<string, Bucket>();
  for (const edge of edges) {
    const wx = enclosingVisibleWrapper(edge.from, parentOf, visibleIds);
    const wy = enclosingVisibleWrapper(edge.to, parentOf, visibleIds);
    if (wx === undefined || wy === undefined) continue;

    let from: string;
    let to: string;
    if (wx === wy) {
      // Intra-wrapper: keep raw endpoints so file/symbol detail stays
      // visible when the wrapper is expanded. Both raw ids must be
      // in `visibleIds` to actually render; otherwise this edge would
      // aggregate to a self-loop on the shared wrapper and drop.
      if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) continue;
      if (edge.from === edge.to) continue;
      from = edge.from;
      to = edge.to;
    } else {
      from = wx;
      to = wy;
    }

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
