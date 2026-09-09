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
 * Resolve every real edge's endpoints to their visible ancestors, drop
 * self-loops (both endpoints resolve to the same visible container),
 * dedupe by resulting `(from, to)` pair. Purely a rendering derivative —
 * the raw `edges` array is untouched.
 *
 * An edge whose either endpoint is unknown (no entry in `parentOf`, so
 * `resolveVisibleEndpoint` returns undefined) is silently dropped.
 */
export function aggregateEdges(
  edges: readonly Edge[],
  parentOf: ReadonlyMap<string, string | undefined>,
  visibleIds: ReadonlySet<string>,
): AggregatedEdge[] {
  const buckets = new Map<string, Bucket>();
  for (const edge of edges) {
    const from = resolveVisibleEndpoint(edge.from, parentOf, visibleIds);
    const to = resolveVisibleEndpoint(edge.to, parentOf, visibleIds);
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
