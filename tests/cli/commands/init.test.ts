import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit } from "../../../src/cli/commands/init.js";

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

    expect(report).toEqual({ repoPath, createdEmpty: true });

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
    const { saveSoll } = await import("../../../src/storage/soll.js");
    await saveSoll(repoPath, {
      meta: { source: "soll" },
      nodes: [{ id: "auth", type: "component", name: "Auth", classes: [] }],
      edges: [],
    });

    await expect(runInit({ repoPath })).rejects.toThrow(/already initialized|not empty/i);
  });

  it("is idempotent when the existing SOLL is empty", async () => {
    const first = await runInit({ repoPath });
    const second = await runInit({ repoPath });
    expect(second).toEqual(first);
  });
});
