import type { Node } from "specifyr";
import { describe, expect, it } from "vitest";
import { buildHierarchy } from "../../frontend/composables/build-hierarchy.js";

/** Create a module node for hierarchy tests. */
function makeModule(path: string, id: string): Node {
  return { id, type: "module", name: path, classes: [] };
}

/** Create a symbol node for hierarchy tests. Omit `path` for a pathless node. */
function makeSymbol(id: string, name: string, path: string | undefined, type = "class"): Node {
  return path === undefined
    ? { id, type, name, classes: [] }
    : { id, type, name, path, classes: [] };
}

describe("buildHierarchy", () => {
  it("returns [] for empty input", () => {
    expect(buildHierarchy([])).toEqual([]);
  });

  it("wraps a single root-level module with no symbols as one top-level file entry", () => {
    const mod = makeModule("readme.ts", "mod-readme");
    const result = buildHierarchy([mod]);
    expect(result).toEqual([
      {
        kind: "file",
        id: "mod-readme",
        label: "readme.ts",
        selectable: true,
        node: mod,
        children: [],
      },
    ]);
  });

  it("keeps symbol children of a file in original array order", () => {
    const mod = makeModule("service.ts", "mod-service");
    const zeta = makeSymbol("sym-zeta", "Zeta", "service.ts");
    const alpha = makeSymbol("sym-alpha", "Alpha", "service.ts");
    const result = buildHierarchy([mod, zeta, alpha]);
    expect(result).toHaveLength(1);
    expect(result[0]?.children.map((c) => c.id)).toEqual(["sym-zeta", "sym-alpha"]);
  });

  it("creates separate top-level folders for modules in different directories", () => {
    const src = makeModule("src/a.ts", "mod-a");
    const tests = makeModule("tests/b.ts", "mod-b");
    const result = buildHierarchy([src, tests]);
    expect(result.map((e) => e.label)).toEqual(["src", "tests"]);
    expect(result[0]?.kind).toBe("folder");
    expect(result[0]?.children.map((c) => c.id)).toEqual(["mod-a"]);
    expect(result[1]?.children.map((c) => c.id)).toEqual(["mod-b"]);
  });

  it("groups two modules in the same folder under one folder entry", () => {
    const a = makeModule("src/a.ts", "mod-a");
    const b = makeModule("src/b.ts", "mod-b");
    const result = buildHierarchy([a, b]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "folder", label: "src" });
    expect(result[0]?.children.map((c) => c.id)).toEqual(["mod-a", "mod-b"]);
  });

  it("nests folders for a deep path and assigns an id for each intermediate folder", () => {
    const mod = makeModule("src/extractors/typescript/parser.ts", "mod-parser");
    const result = buildHierarchy([mod]);
    expect(result).toHaveLength(1);
    const srcFolder = result[0];
    expect(srcFolder).toMatchObject({ kind: "folder", id: "folder:src", label: "src" });
    const extractorsFolder = srcFolder?.children[0];
    expect(extractorsFolder).toMatchObject({
      kind: "folder",
      id: "folder:src/extractors",
      label: "extractors",
    });
    const typescriptFolder = extractorsFolder?.children[0];
    expect(typescriptFolder).toMatchObject({
      kind: "folder",
      id: "folder:src/extractors/typescript",
      label: "typescript",
    });
    const fileEntry = typescriptFolder?.children[0];
    expect(fileEntry).toMatchObject({ kind: "file", id: "mod-parser", label: "parser.ts" });
  });

  it("puts a root-level file directly in the top-level array alongside folder entries, not wrapped", () => {
    const rootMod = makeModule("index.ts", "mod-index");
    const nestedMod = makeModule("src/util.ts", "mod-util");
    const result = buildHierarchy([rootMod, nestedMod]);
    const fileEntry = result.find((e) => e.kind === "file");
    expect(fileEntry).toEqual({
      kind: "file",
      id: "mod-index",
      label: "index.ts",
      selectable: true,
      node: rootMod,
      children: [],
    });
    expect(result.some((e) => e.kind === "folder" && e.label === "src")).toBe(true);
  });

  it("creates a virtual file entry for a non-module node with a path but no owning module", () => {
    const symbol = makeSymbol("sym-widget", "Widget", "src/widget.ts");
    const result = buildHierarchy([symbol]);
    const folder = result[0];
    expect(folder).toMatchObject({ kind: "folder", label: "src" });
    const fileEntry = folder?.children[0];
    expect(fileEntry).toEqual({
      kind: "file",
      id: "file:src/widget.ts",
      label: "widget.ts",
      selectable: false,
      node: undefined,
      children: [
        {
          kind: "symbol",
          id: "sym-widget",
          label: "Widget",
          selectable: true,
          node: symbol,
          children: [],
        },
      ],
    });
  });

  it("puts a pathless non-module node under the synthetic (no folder) / (no file) entries", () => {
    const symbol = makeSymbol("sym-orphan", "Orphan", undefined);
    const result = buildHierarchy([symbol]);
    expect(result).toHaveLength(1);
    const noFolder = result[0];
    expect(noFolder).toMatchObject({
      kind: "folder",
      id: "folder:\0no-path",
      label: "(no folder)",
    });
    const noFile = noFolder?.children[0];
    expect(noFile).toMatchObject({ kind: "file", id: "file:\0no-path", label: "(no file)" });
    expect(noFile?.children).toEqual([
      {
        kind: "symbol",
        id: "sym-orphan",
        label: "Orphan",
        selectable: true,
        node: symbol,
        children: [],
      },
    ]);
  });

  it("handles pathful and pathless nodes together in one call, both landing correctly", () => {
    const mod = makeModule("src/a.ts", "mod-a");
    const orphan = makeSymbol("sym-orphan", "Orphan", undefined);
    const result = buildHierarchy([mod, orphan]);
    expect(result).toHaveLength(2);
    const srcFolder = result.find((e) => e.label === "src");
    const noFolder = result.find((e) => e.label === "(no folder)");
    expect(srcFolder?.children.map((c) => c.id)).toEqual(["mod-a"]);
    const noFile = noFolder?.children[0];
    expect(noFile).toMatchObject({ kind: "file", id: "file:\0no-path" });
    expect(noFile?.children[0]).toMatchObject({ kind: "symbol", id: "sym-orphan" });
  });

  it("sorts folder and file entries case-insensitively by label", () => {
    const zebra = makeModule("zebra.ts", "mod-zebra");
    const apple = makeModule("Apple.ts", "mod-apple");
    const result = buildHierarchy([zebra, apple]);
    expect(result.map((e) => e.label)).toEqual(["Apple.ts", "zebra.ts"]);
  });

  it("sorts the synthetic (no folder) entry last even when its label would otherwise sort earlier", () => {
    const zzzMod = makeModule("zzz/a.ts", "mod-zzz-a");
    const orphan = makeSymbol("sym-orphan", "Orphan", undefined);
    const result = buildHierarchy([zzzMod, orphan]);
    expect(result.map((e) => e.label)).toEqual(["zzz", "(no folder)"]);
  });
});
