import { z } from "zod";

import { AttributeDefinitionSchema, PackNameSchema } from "../core/vocabulary.js";

export const NodeTypeDefinitionSchema = z.object({
  name: z.string().min(1),
  topLevel: z.boolean().default(false),
  attributes: z.array(AttributeDefinitionSchema).default([]),
});

export const EdgeTypeDefinitionSchema = z.object({
  name: z.string().min(1),
  attributes: z.array(AttributeDefinitionSchema).default([]),
});

export const ViewTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const VocabularyPackSchema = z
  .object({
    name: PackNameSchema,
    nodeTypes: z.array(NodeTypeDefinitionSchema).default([]),
    edgeTypes: z.array(EdgeTypeDefinitionSchema).default([]),
    viewTemplates: z.array(ViewTemplateSchema).default([]),
  })
  .check((ctx) => {
    const pack = ctx.value;
    const seenNodes = new Map<string, number>();
    for (const [index, node] of pack.nodeTypes.entries()) {
      const prior = seenNodes.get(node.name);
      if (prior !== undefined) {
        ctx.issues.push({
          code: "custom",
          path: ["nodeTypes", index, "name"],
          message: `duplicate node type in pack ${pack.name}: ${node.name} (also at nodeTypes[${prior}])`,
          input: node.name,
        });
      } else {
        seenNodes.set(node.name, index);
      }
    }
    const seenEdges = new Map<string, number>();
    for (const [index, edge] of pack.edgeTypes.entries()) {
      const prior = seenEdges.get(edge.name);
      if (prior !== undefined) {
        ctx.issues.push({
          code: "custom",
          path: ["edgeTypes", index, "name"],
          message: `duplicate edge type in pack ${pack.name}: ${edge.name} (also at edgeTypes[${prior}])`,
          input: edge.name,
        });
      } else {
        seenEdges.set(edge.name, index);
      }
    }
  });

export type NodeTypeDefinition = z.infer<typeof NodeTypeDefinitionSchema>;
export type EdgeTypeDefinition = z.infer<typeof EdgeTypeDefinitionSchema>;
export type ViewTemplate = z.infer<typeof ViewTemplateSchema>;
export type VocabularyPack = z.infer<typeof VocabularyPackSchema>;
