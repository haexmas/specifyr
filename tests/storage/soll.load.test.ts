import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSoll } from "../../src/storage/soll.ts";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe("loadSoll (happy path)", () => {
  let repoRoot: string;
  let sollRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "specifyr-load-"));
    sollRoot = join(repoRoot, ".specifyr", "soll");
    mkdirSync(join(sollRoot, "components"), { recursive: true });
    mkdirSync(join(sollRoot, "external"), { recursive: true });
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("returns an empty model when only _meta.json and _index.json exist", async () => {
    writeJson(join(sollRoot, "_meta.json"), { source: "soll" });
    writeJson(join(sollRoot, "_index.json"), { edges: [] });

    const model = await loadSoll(repoRoot);
    expect(model.meta.source).toBe("soll");
    expect(model.nodes).toEqual([]);
    expect(model.edges).toEqual([]);
  });

  it("assembles nodes from components/<id>/component.json and external/<id>.json", async () => {
    writeJson(join(sollRoot, "_meta.json"), { source: "soll" });
    writeJson(join(sollRoot, "_index.json"), {
      edges: [{ id: "e1", from: "auth", to: "postgres", type: "reads-from" }],
    });

    const authDir = join(sollRoot, "components", "auth");
    mkdirSync(authDir);
    writeJson(join(authDir, "component.json"), {
      id: "auth",
      type: "component",
      name: "Auth",
    });

    writeJson(join(sollRoot, "external", "postgres.json"), {
      id: "postgres",
      type: "data-store",
      name: "Postgres",
    });

    const model = await loadSoll(repoRoot);
    expect(model.nodes.map((n) => n.id).sort()).toEqual(["auth", "postgres"]);
    expect(model.edges).toEqual([{ id: "e1", from: "auth", to: "postgres", type: "reads-from" }]);
  });

  it("returns nodes and edges in a deterministic order", async () => {
    writeJson(join(sollRoot, "_meta.json"), { source: "soll" });
    writeJson(join(sollRoot, "_index.json"), { edges: [] });

    for (const id of ["zeta", "alpha", "middle"]) {
      const dir = join(sollRoot, "components", id);
      mkdirSync(dir);
      writeJson(join(dir, "component.json"), { id, type: "component", name: id });
    }

    const model = await loadSoll(repoRoot);
    expect(model.nodes.map((n) => n.id)).toEqual(["alpha", "middle", "zeta"]);
  });
});

describe("loadSoll (error paths)", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "specifyr-load-err-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("throws a clear error when .specifyr/soll/_meta.json is missing", async () => {
    await expect(loadSoll(repoRoot)).rejects.toThrow(/_meta\.json/);
  });

  it("throws a clear error when _meta.json is malformed JSON", async () => {
    const soll = join(repoRoot, ".specifyr", "soll");
    mkdirSync(soll, { recursive: true });
    writeFileSync(join(soll, "_meta.json"), "{ not json");
    writeFileSync(join(soll, "_index.json"), '{ "edges": [] }');

    await expect(loadSoll(repoRoot)).rejects.toThrow(/failed to parse/i);
  });

  it("propagates a Zod error when a component.json fails schema validation", async () => {
    const soll = join(repoRoot, ".specifyr", "soll");
    mkdirSync(join(soll, "components", "auth"), { recursive: true });
    writeJson(join(soll, "_meta.json"), { source: "soll" });
    writeJson(join(soll, "_index.json"), { edges: [] });
    writeJson(join(soll, "components", "auth", "component.json"), {
      id: "auth",
      // missing required "type" and "name"
    });

    await expect(loadSoll(repoRoot)).rejects.toThrow();
  });

  it("rejects an _index.json missing the edges key", async () => {
    const soll = join(repoRoot, ".specifyr", "soll");
    mkdirSync(soll, { recursive: true });
    writeJson(join(soll, "_meta.json"), { source: "soll" });
    writeJson(join(soll, "_index.json"), {});
    await expect(loadSoll(repoRoot)).rejects.toThrow();
  });

  it("rejects an _index.json where edges is not an array", async () => {
    const soll = join(repoRoot, ".specifyr", "soll");
    mkdirSync(soll, { recursive: true });
    writeJson(join(soll, "_meta.json"), { source: "soll" });
    writeJson(join(soll, "_index.json"), { edges: "not-an-array" });
    await expect(loadSoll(repoRoot)).rejects.toThrow();
  });
});
