import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { browseDirectory } from "../../frontend/server/utils/browse.js";

describe("browseDirectory", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "specifyr-browse-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("defaults to os.homedir() when rawPath is undefined", async () => {
    const result = await browseDirectory(undefined);
    expect(result.path).toBe(homedir());
  });

  it("defaults to os.homedir() when rawPath is empty string", async () => {
    const result = await browseDirectory("");
    expect(result.path).toBe(homedir());
  });

  it("lists only subdirectories, not files", async () => {
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "file.txt"), "hello");
    const result = await browseDirectory(root);
    expect(result.entries.map((e) => e.name)).toEqual(["sub"]);
    expect(result.entries.every((e) => e.isDir)).toBe(true);
  });

  it("excludes hidden directories (starting with '.')", async () => {
    mkdirSync(join(root, "visible"));
    mkdirSync(join(root, ".hidden"));
    const result = await browseDirectory(root);
    expect(result.entries.map((e) => e.name)).toEqual(["visible"]);
  });

  it("sorts entries case-insensitively by name", async () => {
    mkdirSync(join(root, "bDir"));
    mkdirSync(join(root, "Adir"));
    mkdirSync(join(root, "cdir"));
    const result = await browseDirectory(root);
    expect(result.entries.map((e) => e.name)).toEqual(["Adir", "bDir", "cdir"]);
  });

  it("returns the parent path when listing a subdirectory", async () => {
    mkdirSync(join(root, "child"));
    const result = await browseDirectory(join(root, "child"));
    expect(result.parent).toBe(root);
  });

  it("returns undefined parent at the filesystem root", async () => {
    const result = await browseDirectory("/");
    expect(result.path).toBe("/");
    expect(result.parent).toBeUndefined();
  });

  it("always echoes os.homedir() in the home field", async () => {
    const result = await browseDirectory(root);
    expect(result.home).toBe(homedir());
  });

  it("throws when the path does not exist", async () => {
    await expect(browseDirectory(join(root, "does-not-exist"))).rejects.toThrow();
  });

  it("throws 'not a directory' when the path is a file", async () => {
    const filePath = join(root, "file.txt");
    writeFileSync(filePath, "content");
    await expect(browseDirectory(filePath)).rejects.toThrow(/not a directory/);
  });

  it("resolves symlinks and returns the real path", async () => {
    const realDir = join(root, "real");
    const linkDir = join(root, "link");
    mkdirSync(realDir);
    mkdirSync(join(realDir, "inside"));
    symlinkSync(realDir, linkDir);
    const result = await browseDirectory(linkDir);
    expect(result.path).toBe(realDir);
    expect(result.entries.map((e) => e.name)).toEqual(["inside"]);
    // parent of `real` is `root`, not the link's dirname (which happens to be the same here)
    expect(result.parent).toBe(dirname(realDir));
  });
});
