import { describe, expect, it } from "vitest";
import { resolveImport } from "../../../src/extractors/typescript/resolve-import.js";

describe("resolveImport", () => {
  const files = new Set([
    "src/core/schemas.ts",
    "src/core/index.ts",
    "src/storage/soll.ts",
    "src/storage/index.ts",
    "src/storage/paths.ts",
    "frontend/pages/index.tsx",
    "src/cli/commands/init.ts",
  ]);

  it("resolves a sibling .ts file", () => {
    expect(resolveImport("src/storage/soll.ts", "./paths", files)).toBe("src/storage/paths.ts");
  });

  it("resolves a sibling with an explicit .js extension (Node ESM convention)", () => {
    expect(resolveImport("src/storage/soll.ts", "./paths.js", files)).toBe("src/storage/paths.ts");
  });

  it("resolves parent-relative specifiers", () => {
    expect(resolveImport("src/storage/soll.ts", "../core/schemas", files)).toBe(
      "src/core/schemas.ts",
    );
  });

  it("resolves a directory index.ts", () => {
    expect(resolveImport("src/storage/soll.ts", "../core", files)).toBe("src/core/index.ts");
  });

  it("resolves a .tsx target", () => {
    expect(resolveImport("src/storage/soll.ts", "../../frontend/pages", files)).toBe(
      "frontend/pages/index.tsx",
    );
  });

  it("returns undefined for a specifier that resolves to a file outside the set", () => {
    expect(resolveImport("src/storage/soll.ts", "./missing", files)).toBeUndefined();
  });

  it("returns undefined for an external / package specifier", () => {
    expect(resolveImport("src/storage/soll.ts", "zod", files)).toBeUndefined();
    expect(resolveImport("src/storage/soll.ts", "@vue-flow/core", files)).toBeUndefined();
    expect(resolveImport("src/storage/soll.ts", "node:fs/promises", files)).toBeUndefined();
  });

  it("returns undefined for an absolute specifier", () => {
    expect(resolveImport("src/storage/soll.ts", "/absolute/path", files)).toBeUndefined();
  });

  it("returns undefined for a specifier that resolves to the same file (self-import loop)", () => {
    expect(resolveImport("src/storage/soll.ts", "./soll", files)).toBeUndefined();
    expect(resolveImport("src/storage/soll.ts", ".", files)).toBeUndefined();
  });
});
