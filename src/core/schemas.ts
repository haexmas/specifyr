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
