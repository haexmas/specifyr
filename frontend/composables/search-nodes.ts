import type { Node } from "specifyr";

/**
 * Filter `nodes` to those whose `name` or `path` contains `query` as a
 * case-insensitive substring.
 *
 * An empty or whitespace-only `query` returns `[]` (callers treat "no query"
 * as "no filter", not "match everything"). The query is trimmed before
 * matching. Input order is preserved so the caller can rely on `[0]` being
 * the first match in graph order. No dedupe is performed.
 */
export function matchNodes(query: string, nodes: readonly Node[]): Node[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const needle = trimmed.toLowerCase();
  const out: Node[] = [];
  for (const node of nodes) {
    if (node.name.toLowerCase().includes(needle)) {
      out.push(node);
      continue;
    }
    if (node.path && node.path.toLowerCase().includes(needle)) {
      out.push(node);
    }
  }
  return out;
}
