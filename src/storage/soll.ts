import { readFile, readdir } from "node:fs/promises";

import type { Edge, Model, Node } from "../core/schemas.ts";
import { EdgeSchema, ModelMetaSchema, ModelSchema, NodeSchema } from "../core/schemas.ts";
import { sollRoot as computeSollRoot, resolveInsideRoot } from "./paths.ts";

async function readJson(path: string): Promise<unknown> {
  const raw = await readFile(path, "utf8");
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new Error(`SOLL storage: failed to parse ${path}: ${(cause as Error).message}`);
  }
}

async function listDir(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch (cause) {
    const err = cause as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return [];
    throw cause;
  }
}

export async function loadSoll(repoRoot: string): Promise<Model> {
  const root = computeSollRoot(repoRoot);

  const metaPath = resolveInsideRoot(root, ["_meta.json"]);
  const indexPath = resolveInsideRoot(root, ["_index.json"]);

  const meta = ModelMetaSchema.parse(await readJson(metaPath));
  const indexRaw = (await readJson(indexPath)) as { edges?: unknown };
  const edges: Edge[] = Array.isArray(indexRaw.edges)
    ? indexRaw.edges.map((entry) => EdgeSchema.parse(entry))
    : [];

  const nodes: Node[] = [];

  const componentDirs = (await listDir(resolveInsideRoot(root, ["components"]))).sort();
  for (const id of componentDirs) {
    const componentPath = resolveInsideRoot(root, ["components", id, "component.json"]);
    nodes.push(NodeSchema.parse(await readJson(componentPath)));
  }

  const externalFiles = (await listDir(resolveInsideRoot(root, ["external"])))
    .filter((name) => name.endsWith(".json"))
    .sort();
  for (const file of externalFiles) {
    const externalPath = resolveInsideRoot(root, ["external", file]);
    nodes.push(NodeSchema.parse(await readJson(externalPath)));
  }

  return ModelSchema.parse({ meta, nodes, edges });
}
