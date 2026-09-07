import { createHash } from "node:crypto";

/** Create a deterministic, compact identifier for an extracted IST node. */
export function istNodeId(relativePath: string, qualifiedName: string): string {
  const hash = createHash("sha1")
    .update(`${relativePath}::${qualifiedName}`)
    .digest("hex")
    .slice(0, 12);
  return `ts-${hash}`;
}
