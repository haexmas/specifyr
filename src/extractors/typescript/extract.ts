import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Tree } from "web-tree-sitter";
import type { Edge, Model, Node } from "../../core/schemas.js";
import { ModelSchema } from "../../core/schemas.js";
import { istEdgeId } from "./edge-id.js";
import type { RawImport } from "./extract-imports.js";
import { extractImportsFromTree } from "./extract-imports.js";
import { extractSourceFromTree } from "./extract-source.js";
import { istNodeId } from "./node-id.js";
import { parseTypeScript } from "./parser.js";
import { resolveImport } from "./resolve-import.js";
import { walkTsFiles } from "./walk.js";

/** Build an IST model from all supported TypeScript files below a repository root. */
export async function extractIst(repoRoot: string): Promise<Model> {
  const files = await walkTsFiles(repoRoot);
  const fileSet: ReadonlySet<string> = new Set(files);
  const allNodes: Node[] = [];
  const rawImports: RawImport[] = [];

  // Pass 1: walk + parse each file ONCE, collect nodes and raw import specifiers.
  for (const relativePath of files) {
    const source = await readFile(join(repoRoot, relativePath), "utf8");
    let tree: Tree;
    try {
      tree = await parseTypeScript(source);
    } catch (cause) {
      throw new Error(`parseTypeScript failed for ${relativePath}`, { cause });
    }
    const nodes = extractSourceFromTree(tree, relativePath);
    const imports = extractImportsFromTree(tree, relativePath);
    allNodes.push(...nodes);
    rawImports.push(...imports);
  }

  // Pass 2: resolve each raw import to a target file, look up module node ids
  // at both ends, dedupe by (from, to, type), and emit Edge objects.
  const moduleIdByPath = new Map<string, string>();
  for (const relativePath of files) {
    moduleIdByPath.set(relativePath, istNodeId(relativePath, ""));
  }

  const edges: Edge[] = [];
  const seen = new Set<string>();
  for (const raw of rawImports) {
    const targetPath = resolveImport(raw.fromRelative, raw.specifier, fileSet);
    if (targetPath === undefined) continue;
    const fromId = moduleIdByPath.get(raw.fromRelative);
    const toId = moduleIdByPath.get(targetPath);
    if (!fromId || !toId) continue;
    const key = `${fromId}::${toId}::imports`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      id: istEdgeId(fromId, toId, "imports"),
      from: fromId,
      to: toId,
      type: "imports",
    });
  }

  return ModelSchema.parse({
    meta: { source: "ist", generatedAt: new Date().toISOString() },
    nodes: allNodes,
    edges,
  });
}
