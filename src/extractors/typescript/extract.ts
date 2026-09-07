import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Model, Node } from "../../core/schemas.js";
import { ModelSchema } from "../../core/schemas.js";
import { extractSource } from "./extract-source.js";
import { walkTsFiles } from "./walk.js";

export async function extractIst(repoRoot: string): Promise<Model> {
  const files = await walkTsFiles(repoRoot);
  const allNodes: Node[] = [];

  for (const relativePath of files) {
    const source = await readFile(join(repoRoot, relativePath), "utf8");
    let nodes: Node[];
    try {
      nodes = await extractSource({ relativePath, source });
    } catch (cause) {
      throw new Error(`extractSource failed for ${relativePath}`, { cause });
    }
    allNodes.push(...nodes);
  }

  return ModelSchema.parse({
    meta: { source: "ist", generatedAt: new Date().toISOString() },
    nodes: allNodes,
    edges: [],
  });
}
