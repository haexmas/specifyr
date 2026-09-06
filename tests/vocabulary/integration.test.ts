import { describe, expect, it } from "vitest";
import { SUPPORTED_NODE_TYPES } from "../../src/storage/bucket.js";
import { loadPack } from "../../src/vocabulary/loader.js";

describe("bucket ↔ generic vocabulary pack", () => {
  it("SUPPORTED_NODE_TYPES matches the generic pack's topLevel types", async () => {
    const generic = await loadPack("generic");
    const genericTopLevel = generic.nodeTypes
      .filter((n) => n.topLevel)
      .map((n) => n.name)
      .sort();
    expect(genericTopLevel).toEqual([...SUPPORTED_NODE_TYPES].sort());
  });
});
