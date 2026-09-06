import { describe, expect, it } from "vitest";
import { resolveVocabulary } from "../../src/vocabulary/resolve.js";

describe("resolveVocabulary", () => {
  it("returns node and edge types from a single active pack", async () => {
    const resolved = await resolveVocabulary({ activePacks: ["generic"], customTypes: [] });
    expect(resolved.nodeTypes.has("component")).toBe(true);
    expect(resolved.nodeTypes.has("module")).toBe(true);
    expect(resolved.edgeTypes.has("depends-on")).toBe(true);
    expect(resolved.edgeTypes.has("calls")).toBe(true);
  });

  it("unions types across multiple active packs", async () => {
    const resolved = await resolveVocabulary({
      activePacks: ["generic", "typescript"],
      customTypes: [],
    });
    expect(resolved.nodeTypes.has("component")).toBe(true);
    expect(resolved.nodeTypes.has("interface")).toBe(true);
  });

  it("adds custom node and edge types on top of the packs", async () => {
    const resolved = await resolveVocabulary({
      activePacks: ["generic"],
      customTypes: [
        { kind: "node", name: "gateway", attributes: [] },
        { kind: "edge", name: "authenticates", attributes: [] },
      ],
    });
    expect(resolved.nodeTypes.has("gateway")).toBe(true);
    expect(resolved.edgeTypes.has("authenticates")).toBe(true);
  });

  it("reports a collision when two packs declare the same node type", async () => {
    const resolved = await resolveVocabulary({
      activePacks: ["generic", "angular"],
      customTypes: [],
    });
    expect(resolved.collisions).toContainEqual({
      kind: "node",
      name: "component",
      sources: ["generic", "angular"],
    });
  });

  it("reports a collision when a custom type shadows a pack type", async () => {
    const resolved = await resolveVocabulary({
      activePacks: ["generic"],
      customTypes: [{ kind: "node", name: "component", attributes: [] }],
    });
    expect(resolved.collisions).toContainEqual({
      kind: "node",
      name: "component",
      sources: ["generic", "custom"],
    });
    expect(resolved.nodeTypes.get("component")?.topLevel).toBe(true);
  });

  it("preserves the first-seen definition when a collision occurs", async () => {
    const resolved = await resolveVocabulary({
      activePacks: ["generic", "angular"],
      customTypes: [],
    });
    expect(resolved.nodeTypes.get("component")?.topLevel).toBe(true);
  });

  it("preserves attributes on custom types", async () => {
    const resolved = await resolveVocabulary({
      activePacks: ["generic"],
      customTypes: [
        { kind: "node", name: "gateway", attributes: [{ name: "port", type: "number" }] },
      ],
    });
    expect(resolved.nodeTypes.get("gateway")?.attributes).toEqual([
      { name: "port", type: "number" },
    ]);
  });
});
