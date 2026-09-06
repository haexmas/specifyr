import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveInsideRoot, sollRoot } from "../../src/storage/paths.ts";

describe("sollRoot", () => {
  it("returns <root>/.specifyr/soll", () => {
    expect(sollRoot("/tmp/repo")).toBe(join("/tmp/repo", ".specifyr", "soll"));
  });
});

describe("resolveInsideRoot", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "specifyr-paths-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("joins segments beneath root", () => {
    const resolved = resolveInsideRoot(root, ["components", "auth", "component.json"]);
    expect(resolved).toBe(join(root, "components", "auth", "component.json"));
  });

  it("passes id segments that match NODE_ID_PATTERN", () => {
    expect(() => resolveInsideRoot(root, ["components", "auth-service_1"])).not.toThrow();
  });

  it("rejects an id segment containing a slash", () => {
    expect(() => resolveInsideRoot(root, ["components", `nested${sep}bad`])).toThrow(
      /invalid path segment/i,
    );
  });

  it("rejects an id segment equal to ..", () => {
    expect(() => resolveInsideRoot(root, ["components", ".."])).toThrow(/invalid path segment/i);
  });

  it("rejects an id segment with an absolute prefix", () => {
    expect(() => resolveInsideRoot(root, ["components", "/etc"])).toThrow(/invalid path segment/i);
  });

  it("rejects id segments that traverse outside root (rejected at segment level as defence-in-depth)", () => {
    expect(() =>
      resolveInsideRoot(root, ["components", "auth", "..", "..", "..", "escape"]),
    ).toThrow(/invalid path segment/i);
  });
});
