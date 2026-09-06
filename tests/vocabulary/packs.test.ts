import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SHIPPED_PACKS } from "../../src/core/vocabulary.js";
import { VocabularyPackSchema } from "../../src/vocabulary/pack.js";

const PACKS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "packs");

describe("shipped vocabulary packs", () => {
  it("has exactly one JSON file per SHIPPED_PACKS entry", () => {
    const found = readdirSync(PACKS_DIR)
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -".json".length))
      .sort();
    expect(found).toEqual([...SHIPPED_PACKS].sort());
  });

  for (const name of SHIPPED_PACKS) {
    it(`${name} pack validates against VocabularyPackSchema`, () => {
      const raw = readFileSync(join(PACKS_DIR, `${name}.json`), "utf8");
      const pack = VocabularyPackSchema.parse(JSON.parse(raw));
      expect(pack.name).toBe(name);
    });
  }
});
