import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export const SKIP_DIRS = new Set(["node_modules", "dist", ".output", ".nuxt", ".git"]);

const TS_EXTENSIONS = new Set([".ts", ".tsx"]);

export async function walkTsFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  await walk(root, root, results);
  return results.sort();
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(root, join(dir, entry.name), out);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = extname(entry.name);
    if (!TS_EXTENSIONS.has(ext)) continue;
    out.push(relative(root, join(dir, entry.name)).split(sep).join("/"));
  }
}

function extname(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot);
}
