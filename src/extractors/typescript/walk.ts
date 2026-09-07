import { readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

export const SKIP_DIRS = new Set(["node_modules", "dist", ".output", ".nuxt", ".git"]);

const TS_EXTENSIONS = new Set([".ts", ".tsx"]);

/** Return sorted repository-relative paths for supported TypeScript files. */
export async function walkTsFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  await walk(root, root, results);
  return results.sort();
}

/** Recursively collect supported files while respecting the fixed skip list. */
async function walk(root: string, dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(root, join(dir, entry.name), out);
      continue;
    }
    // Symlinks are silently skipped: readdir's Dirent uses lstat semantics, so
    // entry.isDirectory() and entry.isFile() both return false for symlinks.
    // This is safe (no cycles) but symlinked source layouts lose files. Slice
    // A defers deliberate symlink handling.
    if (!entry.isFile()) continue;
    const ext = extname(entry.name);
    if (!TS_EXTENSIONS.has(ext)) continue;
    out.push(relative(root, join(dir, entry.name)).split(sep).join("/"));
  }
}
