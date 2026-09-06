import { describe, expect, it } from "vitest";
import { VocabularyConfigSchema } from "../../src/core/vocabulary.ts";

describe("VocabularyConfigSchema", () => {
  it("accepts a minimal config with only active packs", () => {
    const parsed = VocabularyConfigSchema.parse({
      activePacks: ["generic", "typescript"],
    });
    expect(parsed.customTypes).toEqual([]);
  });

  it("accepts a custom node type with an enum attribute", () => {
    const parsed = VocabularyConfigSchema.parse({
      activePacks: ["generic"],
      customTypes: [
        {
          kind: "node",
          name: "gateway",
          attributes: [{ name: "protocol", type: "enum", allowedValues: ["http", "grpc"] }],
        },
      ],
    });
    const [custom] = parsed.customTypes;
    expect(custom?.name).toBe("gateway");
    if (custom?.attributes[0]?.type === "enum") {
      expect(custom.attributes[0].allowedValues).toContain("http");
    } else {
      throw new Error("expected an enum attribute");
    }
  });

  it("rejects a pack name that is not shipped", () => {
    expect(() => VocabularyConfigSchema.parse({ activePacks: ["cobol"] })).toThrow();
  });

  it("rejects an enum attribute without allowedValues", () => {
    expect(() =>
      VocabularyConfigSchema.parse({
        activePacks: ["generic"],
        customTypes: [
          {
            kind: "node",
            name: "gateway",
            attributes: [{ name: "protocol", type: "enum" }],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects a duplicate custom-type name inside the same kind", () => {
    expect(() =>
      VocabularyConfigSchema.parse({
        activePacks: ["generic"],
        customTypes: [
          { kind: "node", name: "gateway", attributes: [] },
          { kind: "node", name: "gateway", attributes: [] },
        ],
      }),
    ).toThrow(/duplicate/);
  });

  it("rejects duplicate entries in activePacks", () => {
    expect(() => VocabularyConfigSchema.parse({ activePacks: ["generic", "generic"] })).toThrow(
      /unique/i,
    );
  });
});
