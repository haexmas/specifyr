import { z } from "zod";

export const SHIPPED_PACKS = [
  "generic",
  "python",
  "typescript",
  "vue",
  "angular",
  "c",
  "cpp",
  "rust",
  "java",
  "go",
] as const;

export const PackNameSchema = z.enum(SHIPPED_PACKS);

const ScalarAttributeSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["string", "number", "boolean"]),
});

const EnumAttributeSchema = z.object({
  name: z.string().min(1),
  type: z.literal("enum"),
  allowedValues: z.array(z.string().min(1)).min(1),
});

export const AttributeDefinitionSchema = z.discriminatedUnion("type", [
  ScalarAttributeSchema.extend({ type: z.literal("string") }),
  ScalarAttributeSchema.extend({ type: z.literal("number") }),
  ScalarAttributeSchema.extend({ type: z.literal("boolean") }),
  EnumAttributeSchema,
]);

export const CustomTypeSchema = z.object({
  kind: z.enum(["node", "edge"]),
  name: z.string().min(1),
  attributes: z.array(AttributeDefinitionSchema).default([]),
});

export const VocabularyConfigSchema = z
  .object({
    activePacks: z
      .array(PackNameSchema)
      .min(1)
      .refine((packs) => new Set(packs).size === packs.length, {
        message: "activePacks must be unique",
      }),
    customTypes: z.array(CustomTypeSchema).default([]),
  })
  .check((ctx) => {
    const config = ctx.value;
    const seen = new Map<string, Set<string>>();
    for (const [index, custom] of config.customTypes.entries()) {
      const perKind = seen.get(custom.kind) ?? new Set<string>();
      if (perKind.has(custom.name)) {
        ctx.issues.push({
          code: "custom",
          path: ["customTypes", index, "name"],
          message: `duplicate custom ${custom.kind} type: ${custom.name}`,
          input: custom.name,
        });
      }
      perKind.add(custom.name);
      seen.set(custom.kind, perKind);
    }
  });

export type PackName = z.infer<typeof PackNameSchema>;
export type VocabularyConfig = z.infer<typeof VocabularyConfigSchema>;
export type CustomType = z.infer<typeof CustomTypeSchema>;
export type AttributeDefinition = z.infer<typeof AttributeDefinitionSchema>;
