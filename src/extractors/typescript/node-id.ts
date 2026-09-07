import { createHash } from "node:crypto";

export function istNodeId(relativePath: string, qualifiedName: string): string {
  const hash = createHash("sha1")
    .update(`${relativePath}::${qualifiedName}`)
    .digest("hex")
    .slice(0, 8);
  return `ts-${hash}`;
}
