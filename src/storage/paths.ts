import { lstat } from "node:fs/promises";
import { isAbsolute, join, parse, relative, resolve, sep } from "node:path";

import { NODE_ID_PATTERN } from "../core/schemas.js";

const FIXED_NAMES = new Set([
  ".specifyr",
  "soll",
  "components",
  "external",
  "_meta.json",
  "_index.json",
  "component.json",
]);

/** Return the conventional SOLL storage directory for a repository root. */
export function sollRoot(repoRoot: string): string {
  return join(repoRoot, ".specifyr", "soll");
}

/**
 * Resolve a validated storage path and reject existing symlink components.
 *
 * Lexical validation prevents traversal through path segments. The filesystem
 * check prevents an existing directory or file symlink from redirecting an
 * operation outside the SOLL tree.
 */
export async function resolveInsideRoot(root: string, segments: string[]): Promise<string> {
  for (const segment of segments) {
    if (!isValidSegment(segment)) {
      throw new Error(`SOLL storage: invalid path segment ${JSON.stringify(segment)}`);
    }
  }
  const candidate = resolveLexicallyInsideRoot(root, segments);
  await assertNoSymlinkComponents(candidate);
  return candidate;
}

/** Resolve an existing directory entry while checking it for symlinks. */
export async function resolveExistingEntryInsideRoot(root: string, entry: string): Promise<string> {
  if (!isSingleSegment(entry)) {
    throw new Error(`SOLL storage: invalid path segment ${JSON.stringify(entry)}`);
  }
  const candidate = resolveLexicallyInsideRoot(root, [entry]);
  await assertNoSymlinkComponents(candidate);
  return candidate;
}

/** Resolve path segments lexically and verify that the result stays in root. */
function resolveLexicallyInsideRoot(root: string, segments: string[]): string {
  const absoluteRoot = resolve(root);
  const candidate = resolve(absoluteRoot, ...segments);
  const rel = relative(absoluteRoot, candidate);
  if (rel === "" || rel === "." || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return candidate;
  }
  throw new Error(`SOLL storage: resolved path escapes outside SOLL root: ${candidate}`);
}

/** Reject symlink components in an absolute path, including its root path. */
async function assertNoSymlinkComponents(path: string): Promise<void> {
  const absolutePath = resolve(path);
  const { root } = parse(absolutePath);
  const components = absolutePath.slice(root.length).split(sep).filter(Boolean);
  let current = root;

  for (const component of components) {
    current = join(current, component);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error(`SOLL storage: symbolic link is not allowed in path: ${current}`);
      }
    } catch (cause) {
      const err = cause as NodeJS.ErrnoException;
      if (err.code === "ENOENT") break;
      throw cause;
    }
  }
}

/** Check whether a storage path segment has an allowed name and shape. */
function isValidSegment(segment: string): boolean {
  if (!isSingleSegment(segment)) return false;
  if (FIXED_NAMES.has(segment)) return true;
  // JSON files for external nodes: <id>.json
  if (segment.endsWith(".json")) {
    const stem = segment.slice(0, -".json".length);
    return NODE_ID_PATTERN.test(stem);
  }
  return NODE_ID_PATTERN.test(segment);
}

/** Check whether a value is exactly one filesystem path segment. */
function isSingleSegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    segment !== "." &&
    segment !== ".." &&
    !segment.includes("/") &&
    !segment.includes("\\") &&
    !segment.includes(sep)
  );
}
