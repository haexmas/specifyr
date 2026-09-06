import { describe, expect, it } from "vitest";
import { VocabularyPackSchema } from "../../src/vocabulary/pack.js";

describe("VocabularyPackSchema", () => {
  it("accepts a minimal pack with only a name", () => {
    const parsed = VocabularyPackSchema.parse({ name: "generic" });
    expect(parsed.name).toBe("generic");
    expect(parsed.nodeTypes).toEqual([]);
    expect(parsed.edgeTypes).toEqual([]);
    expect(parsed.viewTemplates).toEqual([]);
  });

  it("accepts a pack with node and edge types", () => {
    const parsed = VocabularyPackSchema.parse({
      name: "generic",
      nodeTypes: [
        { name: "component", topLevel: true },
        { name: "module", topLevel: true, attributes: [{ name: "path", type: "string" }] },
      ],
      edgeTypes: [{ name: "depends-on" }],
    });
    expect(parsed.nodeTypes).toHaveLength(2);
    expect(parsed.nodeTypes[1]?.attributes).toEqual([{ name: "path", type: "string" }]);
    expect(parsed.edgeTypes[0]?.name).toBe("depends-on");
  });

  it("rejects a pack whose name is not a shipped pack", () => {
    expect(() => VocabularyPackSchema.parse({ name: "cobol" })).toThrow();
  });

  it("rejects duplicate node type names inside a pack", () => {
    expect(() =>
      VocabularyPackSchema.parse({
        name: "generic",
        nodeTypes: [
          { name: "component", topLevel: true },
          { name: "component", topLevel: false },
        ],
      }),
    ).toThrow(/duplicate node type/i);
  });

  it("rejects duplicate edge type names inside a pack", () => {
    expect(() =>
      VocabularyPackSchema.parse({
        name: "generic",
        edgeTypes: [{ name: "depends-on" }, { name: "depends-on" }],
      }),
    ).toThrow(/duplicate edge type/i);
  });

  it("defaults topLevel to false when omitted", () => {
    const parsed = VocabularyPackSchema.parse({
      name: "typescript",
      nodeTypes: [{ name: "interface" }],
    });
    expect(parsed.nodeTypes[0]?.topLevel).toBe(false);
  });
});
