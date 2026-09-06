import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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

  it("uses path.dirname to derive the parent directory (Windows-safe)", async () => {
    // Regression: earlier revision used path.slice(0, path.lastIndexOf("/")),
    // which corrupts paths on Windows and any platform where the separator
    // differs from "/". A saved node at components/<id>/component.json must
    // land in the correct dir on any OS.
    await saveSoll(repoRoot, {
      meta: { source: "soll" },
      nodes: [{ id: "auth", type: "component", name: "Auth", classes: [] }],
      edges: [],
    });
    const soll = join(repoRoot, ".specifyr", "soll");
    expect(existsSync(join(soll, "components", "auth", "component.json"))).toBe(true);
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
    expect(existsSync(join(repoRoot, ".specifyr"))).toBe(false);
  });

  it("rejects a symlinked SOLL root before writing metadata", async () => {
    const outside = mkdtempSync(join(tmpdir(), "specifyr-save-outside-"));
    mkdirSync(join(repoRoot, ".specifyr"));
    symlinkSync(outside, join(repoRoot, ".specifyr", "soll"));

    await expect(
      saveSoll(repoRoot, { meta: { source: "soll" }, nodes: [], edges: [] }),
    ).rejects.toThrow(/symbolic link/i);
    expect(existsSync(join(outside, "_meta.json"))).toBe(false);
    rmSync(outside, { recursive: true, force: true });
  });

  it("rejects a symlinked node directory before atomic write or rename", async () => {
    const model = {
      meta: { source: "soll" as const },
      nodes: [{ id: "auth", type: "component", name: "Auth", classes: [] }],
      edges: [],
    };
    await saveSoll(repoRoot, model);

    const soll = join(repoRoot, ".specifyr", "soll");
    const outside = mkdtempSync(join(tmpdir(), "specifyr-save-outside-"));
    rmSync(join(soll, "components", "auth"), { recursive: true, force: true });
    symlinkSync(outside, join(soll, "components", "auth"));

    await expect(saveSoll(repoRoot, model)).rejects.toThrow(/symbolic link/i);
    expect(existsSync(join(outside, "component.json"))).toBe(false);
    rmSync(outside, { recursive: true, force: true });
  });
});

describe("saveSoll (cleanup)", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "specifyr-cleanup-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("removes a component folder that is no longer in the model", async () => {
    await saveSoll(repoRoot, {
      meta: { source: "soll" },
      nodes: [
        { id: "auth", type: "component", name: "Auth", classes: [] },
        { id: "users", type: "component", name: "Users", classes: [] },
      ],
      edges: [],
    });

    await saveSoll(repoRoot, {
      meta: { source: "soll" },
      nodes: [{ id: "auth", type: "component", name: "Auth", classes: [] }],
      edges: [],
    });

    const soll = join(repoRoot, ".specifyr", "soll");
    expect(existsSync(join(soll, "components", "users"))).toBe(false);
    expect(existsSync(join(soll, "components", "auth", "component.json"))).toBe(true);
  });

  it("removes an external file that is no longer in the model", async () => {
    await saveSoll(repoRoot, {
      meta: { source: "soll" },
      nodes: [
        { id: "stripe", type: "external-service", name: "Stripe", classes: [] },
        { id: "postgres", type: "data-store", name: "Postgres", classes: [] },
      ],
      edges: [],
    });

    await saveSoll(repoRoot, {
      meta: { source: "soll" },
      nodes: [{ id: "postgres", type: "data-store", name: "Postgres", classes: [] }],
      edges: [],
    });

    const soll = join(repoRoot, ".specifyr", "soll");
    expect(existsSync(join(soll, "external", "stripe.json"))).toBe(false);
    expect(existsSync(join(soll, "external", "postgres.json"))).toBe(true);
  });

  it("leaves an unknown non-node file untouched during prune", async () => {
    await saveSoll(repoRoot, {
      meta: { source: "soll" },
      nodes: [{ id: "auth", type: "component", name: "Auth", classes: [] }],
      edges: [],
    });

    const soll = join(repoRoot, ".specifyr", "soll");
    writeFileSync(join(soll, "components", "README.md"), "hand-added");

    await saveSoll(repoRoot, {
      meta: { source: "soll" },
      nodes: [{ id: "auth", type: "component", name: "Auth", classes: [] }],
      edges: [],
    });

    expect(existsSync(join(soll, "components", "README.md"))).toBe(true);
  });

  it("cleans up a leftover atomic-write tmp file from a prior crash", async () => {
    await saveSoll(repoRoot, {
      meta: { source: "soll" },
      nodes: [{ id: "auth", type: "component", name: "Auth", classes: [] }],
      edges: [],
    });

    const soll = join(repoRoot, ".specifyr", "soll");
    mkdirSync(join(soll, "external"), { recursive: true });
    const orphanedTmp = join(soll, "external", "postgres.json.tmp-99999-1700000000000");
    writeFileSync(orphanedTmp, '{"partial":true}');

    await saveSoll(repoRoot, {
      meta: { source: "soll" },
      nodes: [{ id: "auth", type: "component", name: "Auth", classes: [] }],
      edges: [],
    });

    expect(existsSync(orphanedTmp)).toBe(false);
  });

  it("rejects a symlinked stale entry instead of pruning outside the SOLL tree", async () => {
    const model = {
      meta: { source: "soll" as const },
      nodes: [{ id: "auth", type: "component", name: "Auth", classes: [] }],
      edges: [],
    };
    await saveSoll(repoRoot, model);

    const soll = join(repoRoot, ".specifyr", "soll");
    const outside = mkdtempSync(join(tmpdir(), "specifyr-prune-outside-"));
    writeFileSync(join(outside, "keep.txt"), "must survive");
    symlinkSync(outside, join(soll, "components", "stale"));

    await expect(saveSoll(repoRoot, model)).rejects.toThrow(/symbolic link/i);
    expect(existsSync(join(outside, "keep.txt"))).toBe(true);
    rmSync(outside, { recursive: true, force: true });
  });
});
