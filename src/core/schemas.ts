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
