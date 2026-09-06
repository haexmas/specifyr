import type { VocabularyConfig } from "../core/vocabulary.js";
import { loadPack } from "./loader.js";
import type { EdgeTypeDefinition, NodeTypeDefinition } from "./pack.js";

export interface Collision {
  kind: "node" | "edge";
  name: string;
  sources: string[];
}

export interface ResolvedVocabulary {
  nodeTypes: Map<string, NodeTypeDefinition>;
  edgeTypes: Map<string, EdgeTypeDefinition>;
  collisions: Collision[];
}

/**
 * Resolves packs in the order given by `config.activePacks`. First-seen wins;
 * collision `sources` are listed in that same order. Callers relying on
 * "generic is authoritative" should list it first.
 *
 * Custom types are processed after all packs; a custom type sharing a pack
 * type's name is recorded as a collision and the pack's definition is kept.
 */
export async function resolveVocabulary(config: VocabularyConfig): Promise<ResolvedVocabulary> {
  const nodeTypes = new Map<string, NodeTypeDefinition>();
  const edgeTypes = new Map<string, EdgeTypeDefinition>();
  const nodeSources = new Map<string, string[]>();
  const edgeSources = new Map<string, string[]>();

  for (const packName of config.activePacks) {
    const pack = await loadPack(packName);
    for (const nodeType of pack.nodeTypes) {
      if (!nodeTypes.has(nodeType.name)) {
        nodeTypes.set(nodeType.name, nodeType);
      }
      nodeSources.set(nodeType.name, [...(nodeSources.get(nodeType.name) ?? []), packName]);
    }
    for (const edgeType of pack.edgeTypes) {
      if (!edgeTypes.has(edgeType.name)) {
        edgeTypes.set(edgeType.name, edgeType);
      }
      edgeSources.set(edgeType.name, [...(edgeSources.get(edgeType.name) ?? []), packName]);
    }
  }

  for (const custom of config.customTypes) {
    if (custom.kind === "node") {
      if (!nodeTypes.has(custom.name)) {
        nodeTypes.set(custom.name, {
          name: custom.name,
          topLevel: false,
          attributes: custom.attributes,
        });
      }
      nodeSources.set(custom.name, [...(nodeSources.get(custom.name) ?? []), "custom"]);
    } else {
      if (!edgeTypes.has(custom.name)) {
        edgeTypes.set(custom.name, { name: custom.name, attributes: custom.attributes });
      }
      edgeSources.set(custom.name, [...(edgeSources.get(custom.name) ?? []), "custom"]);
    }
  }

  const collisions: Collision[] = [];
  for (const [name, sources] of nodeSources) {
    if (sources.length > 1) collisions.push({ kind: "node", name, sources });
  }
  for (const [name, sources] of edgeSources) {
    if (sources.length > 1) collisions.push({ kind: "edge", name, sources });
  }

  return { nodeTypes, edgeTypes, collisions };
}
