import { describe, expect, it } from "vitest";
import { SHIPPED_PACKS } from "../../src/core/vocabulary.js";
import { loadPack } from "../../src/vocabulary/loader.js";

describe("loadPack", () => {
  it("loads the generic pack with the canonical top-level node types", async () => {
    const pack = await loadPack("generic");
    const topLevel = pack.nodeTypes.filter((n) => n.topLevel).map((n) => n.name);
    expect(topLevel.sort()).toEqual(
      ["component", "data-store", "external-service", "module"].sort(),
    );
  });

  it("loads every shipped pack without error", async () => {
    for (const name of SHIPPED_PACKS) {
      const pack = await loadPack(name);
      expect(pack.name).toBe(name);
    }
  });

  it("throws for an unknown pack name at runtime", async () => {
    await expect(loadPack("cobol" as unknown as (typeof SHIPPED_PACKS)[number])).rejects.toThrow();
  });
});
