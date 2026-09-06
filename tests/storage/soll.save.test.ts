import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveSoll } from "../../src/storage/soll.ts";

describe("saveSoll (happy path)", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "specifyr-save-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("creates the SOLL tree from scratch and writes _meta.json and _index.json", async () => {
    await saveSoll(repoRoot, {
      meta: { source: "soll", generatedAt: "2026-09-06T12:00:00Z" },
      nodes: [],
      edges: [],
    });

    const soll = join(repoRoot, ".specifyr", "soll");
    expect(existsSync(join(soll, "_meta.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(soll, "_meta.json"), "utf8"))).toEqual({
      source: "soll",
      generatedAt: "2026-09-06T12:00:00Z",
    });
    expect(JSON.parse(readFileSync(join(soll, "_index.json"), "utf8"))).toEqual({
      edges: [],
    });
  });

  it("writes each component as components/<id>/component.json and each external as external/<id>.json", async () => {
    await saveSoll(repoRoot, {
      meta: { source: "soll" },
      nodes: [
        { id: "auth", type: "component", name: "Auth", classes: [] },
        { id: "postgres", type: "data-store", name: "Postgres", classes: [] },
      ],
      edges: [{ id: "e1", from: "auth", to: "postgres", type: "reads-from" }],
    });

    const soll = join(repoRoot, ".specifyr", "soll");
    expect(existsSync(join(soll, "components", "auth", "component.json"))).toBe(true);
    expect(existsSync(join(soll, "external", "postgres.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(soll, "_index.json"), "utf8"))).toEqual({
      edges: [{ id: "e1", from: "auth", to: "postgres", type: "reads-from" }],
    });
  });

  it("rejects a node whose type is not supported by the storage layer", async () => {
    await expect(
      saveSoll(repoRoot, {
        meta: { source: "soll" },
        nodes: [{ id: "auth", type: "person", name: "Auth", classes: [] }],
        edges: [],
      }),
    ).rejects.toThrow(/unsupported node type/);
  });
});
