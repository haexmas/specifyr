import { createHash } from "node:crypto";

/** Create a deterministic, compact identifier for an IST edge. */
export function istEdgeId(fromNodeId: string, toNodeId: string, type: string): string {
  const hash = createHash("sha1")
    .update(`${fromNodeId}::${toNodeId}::${type}`)
    .digest("hex")
    .slice(0, 12);
  return `tse-${hash}`;
}
