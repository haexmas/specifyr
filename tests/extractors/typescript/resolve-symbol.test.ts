import { describe, expect, it } from "vitest";
import type {
  FileImportIndex,
  SymbolIndex,
} from "../../../src/extractors/typescript/resolve-symbol.js";
import { resolveSymbol } from "../../../src/extractors/typescript/resolve-symbol.js";

function makeSymbolIndex(
  data: Record<string, Record<string, string[]>>,
): SymbolIndex {
  return {
    get(filePath, exportedName) {
      const perFile = data[filePath];
      const ids = perFile?.[exportedName];
      return ids ?? [];
    },
  };
}

function makeFileImports(
  data: Record<string, { targetFile: string; exportedName: string }>,
): FileImportIndex {
  return {
    get(localName) {
      return data[localName];
    },
  };
}

function localsWith(...pairs: Array<[string, string[]]>): ReadonlyMap<string, readonly string[]> {
  const map = new Map<string, readonly string[]>();
  for (const [name, ids] of pairs) map.set(name, ids);
  return map;
}

describe("resolveSymbol", () => {
  it("returns the same-file local id when the target is declared locally", () => {
    const locals = localsWith(["Bar", ["local-bar-id"]]);
    const imports = makeFileImports({});
    const symbols = makeSymbolIndex({});
    expect(resolveSymbol("src/foo.ts", "Bar", imports, symbols, locals)).toBe("local-bar-id");
  });

  it("returns undefined when the same-file name has multiple candidates (ambiguous)", () => {
    const locals = localsWith(["Bar", ["local-1", "local-2"]]);
    const imports = makeFileImports({});
    const symbols = makeSymbolIndex({});
    expect(resolveSymbol("src/foo.ts", "Bar", imports, symbols, locals)).toBeUndefined();
  });

  it("resolves an imported target through the symbol index", () => {
    const locals = localsWith();
    const imports = makeFileImports({
      Bar: { targetFile: "src/bar.ts", exportedName: "Bar" },
    });
    const symbols = makeSymbolIndex({
      "src/bar.ts": { Bar: ["bar-id"] },
    });
    expect(resolveSymbol("src/foo.ts", "Bar", imports, symbols, locals)).toBe("bar-id");
  });

  it("resolves an aliased import — local name maps to the target file's original exported name", () => {
    const locals = localsWith();
    const imports = makeFileImports({
      Baz: { targetFile: "src/bar.ts", exportedName: "Bar" },
    });
    const symbols = makeSymbolIndex({
      "src/bar.ts": { Bar: ["bar-id"] },
    });
    expect(resolveSymbol("src/foo.ts", "Baz", imports, symbols, locals)).toBe("bar-id");
  });

  it("returns undefined when the target file has no matching export", () => {
    const locals = localsWith();
    const imports = makeFileImports({
      Bar: { targetFile: "src/bar.ts", exportedName: "Bar" },
    });
    const symbols = makeSymbolIndex({
      "src/bar.ts": {},
    });
    expect(resolveSymbol("src/foo.ts", "Bar", imports, symbols, locals)).toBeUndefined();
  });

  it("returns undefined when the target file has ambiguous exports (duplicate exported declarations)", () => {
    const locals = localsWith();
    const imports = makeFileImports({
      Bar: { targetFile: "src/bar.ts", exportedName: "Bar" },
    });
    const symbols = makeSymbolIndex({
      "src/bar.ts": { Bar: ["bar-1", "bar-2"] },
    });
    expect(resolveSymbol("src/foo.ts", "Bar", imports, symbols, locals)).toBeUndefined();
  });

  it("returns undefined when the identifier is neither same-file nor imported", () => {
    const locals = localsWith();
    const imports = makeFileImports({});
    const symbols = makeSymbolIndex({});
    expect(resolveSymbol("src/foo.ts", "Unknown", imports, symbols, locals)).toBeUndefined();
  });

  it("prefers the same-file local over an import with the same name (shadowing)", () => {
    const locals = localsWith(["Bar", ["local-bar-id"]]);
    const imports = makeFileImports({
      Bar: { targetFile: "src/bar.ts", exportedName: "Bar" },
    });
    const symbols = makeSymbolIndex({
      "src/bar.ts": { Bar: ["imported-bar-id"] },
    });
    expect(resolveSymbol("src/foo.ts", "Bar", imports, symbols, locals)).toBe("local-bar-id");
  });

  it("resolves through a transitive re-export via the symbol index result", () => {
    // Callers pre-flatten re-exports into the symbol index; resolveSymbol only
    // consults its inputs. Simulate the re-export target being exposed under the
    // re-export file with the aliased name.
    const locals = localsWith();
    const imports = makeFileImports({
      Bar: { targetFile: "src/reexport.ts", exportedName: "Bar" },
    });
    const symbols = makeSymbolIndex({
      "src/reexport.ts": { Bar: ["deep-bar-id"] },
    });
    expect(resolveSymbol("src/foo.ts", "Bar", imports, symbols, locals)).toBe("deep-bar-id");
  });

  it("returns undefined for a cyclic re-export (index returns empty)", () => {
    const locals = localsWith();
    const imports = makeFileImports({
      Bar: { targetFile: "src/cycle.ts", exportedName: "Bar" },
    });
    const symbols = makeSymbolIndex({
      "src/cycle.ts": {},
    });
    expect(resolveSymbol("src/foo.ts", "Bar", imports, symbols, locals)).toBeUndefined();
  });
});
