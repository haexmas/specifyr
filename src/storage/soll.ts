import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";

import type { Edge, Model, Node } from "../core/schemas.ts";
import { EdgeSchema, ModelMetaSchema, ModelSchema, NodeSchema } from "../core/schemas.ts";
import { bucketForNode } from "./bucket.ts";
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

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const dir = path.slice(0, path.lastIndexOf("/"));
  await mkdir(dir, { recursive: true });
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, payload, "utf8");
  await rename(tmp, path);
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

export async function saveSoll(repoRoot: string, model: Model): Promise<void> {
  const parsed = ModelSchema.parse(model);
  const root = computeSollRoot(repoRoot);
  await mkdir(root, { recursive: true });

  await writeJsonAtomic(resolveInsideRoot(root, ["_meta.json"]), parsed.meta);
  await writeJsonAtomic(resolveInsideRoot(root, ["_index.json"]), { edges: parsed.edges });

  for (const node of parsed.nodes) {
    const { bucket, layout } = bucketForNode(node);
    const path =
      layout === "folder"
        ? resolveInsideRoot(root, [bucket, node.id, "component.json"])
        : resolveInsideRoot(root, [bucket, `${node.id}.json`]);
    await writeJsonAtomic(path, node);
  }
}
