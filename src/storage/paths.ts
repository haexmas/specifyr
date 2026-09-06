import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { NODE_ID_PATTERN } from "../core/schemas.ts";

const FIXED_NAMES = new Set([
  ".specifyr",
  "soll",
  "components",
  "external",
  "_meta.json",
  "_index.json",
  "component.json",
]);

export function sollRoot(repoRoot: string): string {
  return join(repoRoot, ".specifyr", "soll");
}

// Two-line defence: (1) reject any segment that could traverse (dots, slashes,
// absolute prefixes), (2) as belt-and-suspenders, verify the resolved path is
// still under the root. Line 1 catches every string-only escape; line 2 catches
// anything else (bugs, future callers).
export function resolveInsideRoot(root: string, segments: string[]): string {
  for (const segment of segments) {
    if (!isValidSegment(segment)) {
      throw new Error(`SOLL storage: invalid path segment ${JSON.stringify(segment)}`);
    }
  }
  const absoluteRoot = resolve(root);
  const candidate = resolve(absoluteRoot, ...segments);
  const rel = relative(absoluteRoot, candidate);
  if (rel === "" || rel === "." || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return candidate;
  }
  throw new Error(`SOLL storage: resolved path escapes outside SOLL root: ${candidate}`);
}

function isValidSegment(segment: string): boolean {
  if (segment.length === 0) return false;
  if (segment === "." || segment === "..") return false;
  if (segment.includes("/") || segment.includes("\\") || segment.includes(sep)) return false;
  if (FIXED_NAMES.has(segment)) return true;
  // JSON files for external nodes: <id>.json
  if (segment.endsWith(".json")) {
    const stem = segment.slice(0, -".json".length);
    return NODE_ID_PATTERN.test(stem);
  }
  return NODE_ID_PATTERN.test(segment);
}
