import { z } from "zod";

export const MethodSchema = z.object({
  name: z.string().min(1),
});

export const AttributeSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1).optional(),
});

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
  generatedAt: z.string().datetime().optional(),
});

export const ModelSchema = z
  .object({
    nodes: z.array(NodeSchema).default([]),
    edges: z.array(EdgeSchema).default([]),
    meta: ModelMetaSchema,
  })
  .superRefine((model, ctx) => {
    const ids = new Set<string>();
    for (const node of model.nodes) {
      if (ids.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes"],
          message: `duplicate node id: ${node.id}`,
        });
      }
      ids.add(node.id);
    }
    for (const [index, edge] of model.edges.entries()) {
      if (!ids.has(edge.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", index, "from"],
          message: `edge references unknown node: ${edge.from}`,
        });
      }
      if (!ids.has(edge.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", index, "to"],
          message: `edge references unknown node: ${edge.to}`,
        });
      }
    }
  });

export type Model = z.infer<typeof ModelSchema>;
export type ModelSource = (typeof MODEL_SOURCES)[number];
