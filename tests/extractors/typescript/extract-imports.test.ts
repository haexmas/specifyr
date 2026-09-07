import { describe, expect, it } from "vitest";
import { extractImports } from "../../../src/extractors/typescript/extract-imports.js";

describe("extractImports", () => {
  it("returns an empty list for a file with no imports", async () => {
    const raw = await extractImports("src/x.ts", "export const y = 1;");
    expect(raw).toEqual([]);
  });

  it("extracts a single named import", async () => {
    const raw = await extractImports("src/foo.ts", 'import { Bar } from "./bar";\n');
    expect(raw).toEqual([{ fromRelative: "src/foo.ts", specifier: "./bar" }]);
  });

  it("extracts a default import", async () => {
    const raw = await extractImports("src/foo.ts", 'import Bar from "./bar";\n');
    expect(raw).toEqual([{ fromRelative: "src/foo.ts", specifier: "./bar" }]);
  });

  it("extracts a namespace import", async () => {
    const raw = await extractImports("src/foo.ts", 'import * as Bar from "./bar";\n');
    expect(raw).toEqual([{ fromRelative: "src/foo.ts", specifier: "./bar" }]);
  });

  it("extracts a side-effect-only import", async () => {
    const raw = await extractImports("src/foo.ts", 'import "./bar";\n');
    expect(raw).toEqual([{ fromRelative: "src/foo.ts", specifier: "./bar" }]);
  });

  it("extracts multiple imports in file order (no dedup at this layer)", async () => {
    const raw = await extractImports(
      "src/foo.ts",
      [
        'import { A } from "./a";',
        'import { B } from "./b";',
        'import { AA } from "./a";',
        "",
      ].join("\n"),
    );
    expect(raw.map((r) => r.specifier)).toEqual(["./a", "./b", "./a"]);
  });

  it("extracts imports even when preceded by comments", async () => {
    const raw = await extractImports(
      "src/foo.ts",
      '// header comment\nimport { X } from "./x";\n',
    );
    expect(raw).toEqual([{ fromRelative: "src/foo.ts", specifier: "./x" }]);
  });

  it("does NOT extract require() calls (Slice B is static imports only)", async () => {
    const raw = await extractImports("src/foo.ts", 'const bar = require("./bar");\n');
    expect(raw).toEqual([]);
  });

  it("does NOT extract dynamic imports (Slice B is static imports only)", async () => {
    const raw = await extractImports(
      "src/foo.ts",
      'const bar = () => import("./bar");\n',
    );
    expect(raw).toEqual([]);
  });

  it("extracts external and node: specifiers too (resolver drops them later)", async () => {
    const raw = await extractImports(
      "src/foo.ts",
      [
        'import { readFile } from "node:fs/promises";',
        'import { z } from "zod";',
        "",
      ].join("\n"),
    );
    expect(raw.map((r) => r.specifier).sort()).toEqual(["node:fs/promises", "zod"]);
  });
});
