import { z } from "zod";

export const MethodSchema = z.object({
  name: z.string().min(1),
});

export type Method = z.infer<typeof MethodSchema>;

export const AttributeSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1).optional(),
});

export type Attribute = z.infer<typeof AttributeSchema>;

export const ClassSchema = z.object({
  name: z.string().min(1),
  methods: z.array(MethodSchema).default([]),
  attributes: z.array(AttributeSchema).default([]),
});

export type Class = z.infer<typeof ClassSchema>;

export const NODE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export const NodeSchema = z
  .object({
    id: z.string().regex(NODE_ID_PATTERN, {
      message: "node id must match ^[a-z0-9][a-z0-9_-]{0,63}$",
    }),
    type: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    path: z.string().optional(),
    classes: z.array(ClassSchema).default([]),
  })
  .catchall(z.unknown());

export type Node = z.infer<typeof NodeSchema>;
export type ModelNode = Node;

export const EdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().regex(NODE_ID_PATTERN, {
    message: "edge.from must match the node id pattern",
  }),
  to: z.string().regex(NODE_ID_PATTERN, {
    message: "edge.to must match the node id pattern",
  }),
  type: z.string().min(1),
});

export type Edge = z.infer<typeof EdgeSchema>;

export const MODEL_SOURCES = ["soll", "plan", "ist"] as const;

export const ModelMetaSchema = z.object({
  source: z.enum(MODEL_SOURCES),
  generatedAt: z.iso.datetime().optional(),
});

export type ModelMeta = z.infer<typeof ModelMetaSchema>;

export const ModelSchema = z
  .object({
    nodes: z.array(NodeSchema).default([]),
    edges: z.array(EdgeSchema).default([]),
    meta: ModelMetaSchema,
  })
  .check((ctx) => {
    const model = ctx.value;
    const firstSeen = new Map<string, number>();
    for (const [index, node] of model.nodes.entries()) {
      const priorIndex = firstSeen.get(node.id);
      if (priorIndex !== undefined) {
        ctx.issues.push({
          code: "custom",
          path: ["nodes", index, "id"],
          message: `duplicate node id: ${node.id} (also at nodes[${priorIndex}])`,
          input: node.id,
        });
      } else {
        firstSeen.set(node.id, index);
      }
    }
    const ids = new Set(firstSeen.keys());
    for (const [index, edge] of model.edges.entries()) {
      if (!ids.has(edge.from)) {
        ctx.issues.push({
          code: "custom",
          path: ["edges", index, "from"],
          message: `edge references unknown node: ${edge.from}`,
          input: edge.from,
        });
      }
      if (!ids.has(edge.to)) {
        ctx.issues.push({
          code: "custom",
          path: ["edges", index, "to"],
          message: `edge references unknown node: ${edge.to}`,
          input: edge.to,
        });
      }
    }
  });

export type Model = z.infer<typeof ModelSchema>;
export type ModelSource = (typeof MODEL_SOURCES)[number];
