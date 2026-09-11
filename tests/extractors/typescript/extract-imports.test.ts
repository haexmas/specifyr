import { describe, expect, it } from "vitest";
import { extractImports } from "../../../src/extractors/typescript/extract-imports.js";

describe("extractImports", () => {
  it("returns an empty list for a file with no imports", async () => {
    const raw = await extractImports("src/x.ts", "export const y = 1;");
    expect(raw).toEqual([]);
  });

  it("extracts a single named import with a self-named binding", async () => {
    const raw = await extractImports("src/foo.ts", 'import { Bar } from "./bar";\n');
    expect(raw).toEqual([
      {
        fromRelative: "src/foo.ts",
        specifier: "./bar",
        bindings: [{ local: "Bar", imported: "Bar" }],
      },
    ]);
  });

  it("extracts a named import with an alias", async () => {
    const raw = await extractImports("src/foo.ts", 'import { Bar as Baz } from "./bar";\n');
    expect(raw).toEqual([
      {
        fromRelative: "src/foo.ts",
        specifier: "./bar",
        bindings: [{ local: "Baz", imported: "Bar" }],
      },
    ]);
  });

  it("extracts multiple named imports (mixed self-named and aliased) in source order", async () => {
    const raw = await extractImports(
      "src/foo.ts",
      'import { Foo, Bar as Baz } from "./x";\n',
    );
    expect(raw).toEqual([
      {
        fromRelative: "src/foo.ts",
        specifier: "./x",
        bindings: [
          { local: "Foo", imported: "Foo" },
          { local: "Baz", imported: "Bar" },
        ],
      },
    ]);
  });

  it("extracts a default import as imported=default", async () => {
    const raw = await extractImports("src/foo.ts", 'import Bar from "./bar";\n');
    expect(raw).toEqual([
      {
        fromRelative: "src/foo.ts",
        specifier: "./bar",
        bindings: [{ local: "Bar", imported: "default" }],
      },
    ]);
  });

  it("extracts a namespace import as imported=*", async () => {
    const raw = await extractImports("src/foo.ts", 'import * as Bar from "./bar";\n');
    expect(raw).toEqual([
      {
        fromRelative: "src/foo.ts",
        specifier: "./bar",
        bindings: [{ local: "Bar", imported: "*" }],
      },
    ]);
  });

  it("extracts a side-effect-only import with empty bindings", async () => {
    const raw = await extractImports("src/foo.ts", 'import "./bar";\n');
    expect(raw).toEqual([
      { fromRelative: "src/foo.ts", specifier: "./bar", bindings: [] },
    ]);
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
    expect(raw[0]?.bindings).toEqual([{ local: "A", imported: "A" }]);
    expect(raw[1]?.bindings).toEqual([{ local: "B", imported: "B" }]);
    expect(raw[2]?.bindings).toEqual([{ local: "AA", imported: "AA" }]);
  });

  it("extracts imports even when preceded by comments", async () => {
    const raw = await extractImports("src/foo.ts", '// header comment\nimport { X } from "./x";\n');
    expect(raw).toEqual([
      {
        fromRelative: "src/foo.ts",
        specifier: "./x",
        bindings: [{ local: "X", imported: "X" }],
      },
    ]);
  });

  it("does NOT extract require() calls (Slice B is static imports only)", async () => {
    const raw = await extractImports("src/foo.ts", 'const bar = require("./bar");\n');
    expect(raw).toEqual([]);
  });

  it("does NOT extract dynamic imports (Slice B is static imports only)", async () => {
    const raw = await extractImports("src/foo.ts", 'const bar = () => import("./bar");\n');
    expect(raw).toEqual([]);
  });

  it("extracts external and node: specifiers too (resolver drops them later)", async () => {
    const raw = await extractImports(
      "src/foo.ts",
      ['import { readFile } from "node:fs/promises";', 'import { z } from "zod";', ""].join("\n"),
    );
    expect(raw.map((r) => r.specifier).sort()).toEqual(["node:fs/promises", "zod"]);
  });

  it("extracts import type statements same as value imports", async () => {
    const raw = await extractImports("src/foo.ts", 'import type { Bar } from "./bar";\n');
    expect(raw).toEqual([
      {
        fromRelative: "src/foo.ts",
        specifier: "./bar",
        bindings: [{ local: "Bar", imported: "Bar" }],
      },
    ]);
  });
});
