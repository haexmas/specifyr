import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "../../../src/cli/commands/init.js";
import { saveSoll } from "../../../src/storage/soll.js";

describe("runInit", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-init-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("creates .specifyr/soll/ with an empty model and returns a report naming the path", async () => {
    const report = await runInit({ repoPath });

    expect(report).toEqual({ repoPath });

    const soll = join(repoPath, ".specifyr", "soll");
    expect(existsSync(join(soll, "_meta.json"))).toBe(true);
    expect(existsSync(join(soll, "_index.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(soll, "_meta.json"), "utf8"))).toEqual({
      source: "soll",
    });
    expect(JSON.parse(readFileSync(join(soll, "_index.json"), "utf8"))).toEqual({
      edges: [],
    });
  });

  it("refuses to overwrite an existing non-empty SOLL", async () => {
    await runInit({ repoPath });
    await saveSoll(repoPath, {
      meta: { source: "soll" },
      nodes: [{ id: "auth", type: "component", name: "Auth", classes: [] }],
      edges: [],
    });

    let error: unknown;
    try {
      await runInit({ repoPath });
    } catch (cause) {
      error = cause;
    }
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toMatch(/already initialized/i);
    expect(message).toMatch(/not empty/i);
    expect(message).toMatch(/1 node/);
  });

  it("is idempotent when the existing SOLL is empty", async () => {
    await runInit({ repoPath });
    const metaPath = join(repoPath, ".specifyr", "soll", "_meta.json");
    const firstMtime = statSync(metaPath).mtimeMs;

    // Sleep 20ms to ensure a re-write would change mtime on any FS.
    await new Promise((resolve) => setTimeout(resolve, 20));

    await runInit({ repoPath });
    const secondMtime = statSync(metaPath).mtimeMs;

    expect(secondMtime).toBe(firstMtime);
    expect(existsSync(metaPath)).toBe(true);
  });
});
