import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SKIP_DIRS, walkTsFiles } from "../../../src/extractors/typescript/walk.js";

describe("walkTsFiles", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "specifyr-walk-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns an empty list for an empty tree", async () => {
    expect(await walkTsFiles(root)).toEqual([]);
  });

  it("finds .ts files at every depth", async () => {
    writeFileSync(join(root, "a.ts"), "");
    mkdirSync(join(root, "sub", "deep"), { recursive: true });
    writeFileSync(join(root, "sub", "b.ts"), "");
    writeFileSync(join(root, "sub", "deep", "c.ts"), "");
    const paths = await walkTsFiles(root);
    expect(paths).toEqual(["a.ts", "sub/b.ts", "sub/deep/c.ts"]);
  });

  it("finds .tsx files too", async () => {
    writeFileSync(join(root, "a.tsx"), "");
    const paths = await walkTsFiles(root);
    expect(paths).toEqual(["a.tsx"]);
  });

  it("skips node_modules, dist, .output, .nuxt, .git and their contents", async () => {
    for (const dir of SKIP_DIRS) {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, "x.ts"), "");
    }
    writeFileSync(join(root, "keep.ts"), "");
    expect(await walkTsFiles(root)).toEqual(["keep.ts"]);
  });

  it("ignores non-TypeScript files", async () => {
    writeFileSync(join(root, "keep.ts"), "");
    writeFileSync(join(root, "ignore.js"), "");
    writeFileSync(join(root, "ignore.md"), "");
    expect(await walkTsFiles(root)).toEqual(["keep.ts"]);
  });

  it("returns paths sorted for determinism", async () => {
    writeFileSync(join(root, "z.ts"), "");
    writeFileSync(join(root, "a.ts"), "");
    writeFileSync(join(root, "m.ts"), "");
    expect(await walkTsFiles(root)).toEqual(["a.ts", "m.ts", "z.ts"]);
  });
});
