import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

import type { Edge, Model, Node } from "../core/schemas.js";
import {
  EdgeSchema,
  ModelMetaSchema,
  ModelSchema,
  NODE_ID_PATTERN,
  NodeSchema,
} from "../core/schemas.js";
import { bucketForNode } from "./bucket.js";
import {
  sollRoot as computeSollRoot,
  resolveExistingEntryInsideRoot,
  resolveInsideRoot,
} from "./paths.js";

const IndexFileSchema = z.object({ edges: z.array(EdgeSchema) });

const TMP_PATTERN = /\.tmp-\d+-\d+$/;

/** Read and parse a JSON file after verifying its path remains symlink-free. */
async function readJson(path: string): Promise<unknown> {
  await resolveExistingEntryInsideRoot(dirname(path), path.slice(dirname(path).length + 1));
  const raw = await readFile(path, "utf8");
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new Error(`SOLL storage: failed to parse ${path}: ${(cause as Error).message}`);
  }
}

/** List a storage directory after verifying its existing path components. */
async function listDir(path: string): Promise<string[]> {
  await resolveExistingEntryInsideRoot(dirname(path), path.slice(dirname(path).length + 1));
  try {
    return await readdir(path);
  } catch (cause) {
    const err = cause as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return [];
    throw cause;
  }
}

/** Write JSON through a temporary file and an atomic rename. */
async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const dir = dirname(path);
  await resolveExistingEntryInsideRoot(dir, path.slice(dir.length + 1));
  await mkdir(dir, { recursive: true });
  await resolveExistingEntryInsideRoot(dir, path.slice(dir.length + 1));
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await resolveExistingEntryInsideRoot(dirname(tmp), tmp.slice(dirname(tmp).length + 1));
  await writeFile(tmp, payload, "utf8");
  await resolveExistingEntryInsideRoot(dir, path.slice(dir.length + 1));
  await resolveExistingEntryInsideRoot(dirname(tmp), tmp.slice(dirname(tmp).length + 1));
  await rename(tmp, path);
}

/** Load and validate the model persisted under a repository's SOLL directory. */
export async function loadSoll(repoRoot: string): Promise<Model> {
  const root = computeSollRoot(repoRoot);

  const metaPath = await resolveInsideRoot(root, ["_meta.json"]);
  const indexPath = await resolveInsideRoot(root, ["_index.json"]);

  const meta = ModelMetaSchema.parse(await readJson(metaPath));
  const index = IndexFileSchema.parse(await readJson(indexPath));
  const edges: Edge[] = index.edges;

  const nodes: Node[] = [];

  const componentDirs = (await listDir(await resolveInsideRoot(root, ["components"]))).sort();
  for (const id of componentDirs) {
    const componentPath = await resolveInsideRoot(root, ["components", id, "component.json"]);
    nodes.push(NodeSchema.parse(await readJson(componentPath)));
  }

  const externalFiles = (await listDir(await resolveInsideRoot(root, ["external"])))
    .filter((name) => name.endsWith(".json"))
    .sort();
  for (const file of externalFiles) {
    const externalPath = await resolveInsideRoot(root, ["external", file]);
    nodes.push(NodeSchema.parse(await readJson(externalPath)));
  }

  return ModelSchema.parse({ meta, nodes, edges });
}

/** Validate and persist a model under a repository's SOLL directory. */
export async function saveSoll(repoRoot: string, model: Model): Promise<void> {
  const parsed = ModelSchema.parse(model);
  const storageNodes = parsed.nodes.map((node) => ({ node, ...bucketForNode(node) }));
  const root = computeSollRoot(repoRoot);

  const metaPath = await resolveInsideRoot(root, ["_meta.json"]);
  const indexPath = await resolveInsideRoot(root, ["_index.json"]);
  const componentsPath = await resolveInsideRoot(root, ["components"]);
  const externalPath = await resolveInsideRoot(root, ["external"]);
  const nodePaths = await Promise.all(
    storageNodes.map(async ({ node, bucket, layout }) => ({
      node,
      path: await (layout === "folder"
        ? resolveInsideRoot(root, [bucket, node.id, "component.json"])
        : resolveInsideRoot(root, [bucket, `${node.id}.json`])),
    })),
  );
  await mkdir(root, { recursive: true });

  await writeJsonAtomic(metaPath, parsed.meta);
  await writeJsonAtomic(indexPath, { edges: parsed.edges });

  for (const { node, path } of nodePaths) {
    await writeJsonAtomic(path, node);
  }

  const keptComponents = new Set<string>();
  const keptExternal = new Set<string>();
  for (const { node, bucket, layout } of storageNodes) {
    if (bucket === "components" && layout === "folder") {
      keptComponents.add(node.id);
    } else if (bucket === "external" && layout === "file") {
      keptExternal.add(`${node.id}.json`);
    }
  }

  await pruneDirectory(componentsPath, (name) => keptComponents.has(name), { rmDir: true });
  await pruneDirectory(externalPath, (name) => keptExternal.has(name), {
    rmDir: false,
  });
}

/** Remove stale generated entries without following symlinks or unknown files. */
async function pruneDirectory(
  path: string,
  keep: (name: string) => boolean,
  options: { rmDir: boolean },
): Promise<void> {
  const entries = await listDir(path);
  for (const entry of entries) {
    const target = await resolveExistingEntryInsideRoot(path, entry);
    if (keep(entry)) continue;
    const isGeneratedEntry = options.rmDir
      ? NODE_ID_PATTERN.test(entry)
      : entry.endsWith(".json") && NODE_ID_PATTERN.test(entry.slice(0, -5));
    if (!isGeneratedEntry && !TMP_PATTERN.test(entry)) continue;
    await rm(target, { recursive: options.rmDir, force: true });
  }
}
