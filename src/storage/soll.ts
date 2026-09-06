import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { z } from "zod";

import type { Edge, Model, Node } from "../core/schemas.ts";
import { EdgeSchema, ModelMetaSchema, ModelSchema, NodeSchema } from "../core/schemas.ts";
import { bucketForNode } from "./bucket.ts";
import { sollRoot as computeSollRoot, resolveInsideRoot } from "./paths.ts";

const IndexFileSchema = z.object({ edges: z.array(EdgeSchema) });

const TMP_PATTERN = /\.tmp-\d+-\d+$/;

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
  const dir = dirname(path);
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
  const index = IndexFileSchema.parse(await readJson(indexPath));
  const edges: Edge[] = index.edges;

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

  const keptComponents = new Set<string>();
  const keptExternal = new Set<string>();
  for (const node of parsed.nodes) {
    const { bucket, layout } = bucketForNode(node);
    if (bucket === "components" && layout === "folder") {
      keptComponents.add(node.id);
    } else if (bucket === "external" && layout === "file") {
      keptExternal.add(`${node.id}.json`);
    }
  }

  await pruneDirectory(
    resolveInsideRoot(root, ["components"]),
    (name) => keptComponents.has(name),
    { rmDir: true },
  );
  await pruneDirectory(resolveInsideRoot(root, ["external"]), (name) => keptExternal.has(name), {
    rmDir: false,
  });
}

async function pruneDirectory(
  path: string,
  keep: (name: string) => boolean,
  options: { rmDir: boolean },
): Promise<void> {
  const entries = await listDir(path);
  for (const entry of entries) {
    if (keep(entry)) continue;
    let target: string;
    try {
      target = resolveInsideRoot(path, [entry]);
    } catch {
      // Entry does not match the safe-segment pattern.
      // Recover crashed-write tmp files; leave anything else alone.
      if (TMP_PATTERN.test(entry)) {
        try {
          await rm(join(path, entry), { force: true });
        } catch {
          // best-effort tmp cleanup
        }
      }
      continue;
    }
    await rm(target, { recursive: options.rmDir, force: true });
  }
}
