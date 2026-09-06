import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
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

  it("joins segments beneath root", async () => {
    const resolved = await resolveInsideRoot(root, ["components", "auth", "component.json"]);
    expect(resolved).toBe(join(root, "components", "auth", "component.json"));
  });

  it("passes id segments that match NODE_ID_PATTERN", async () => {
    await expect(resolveInsideRoot(root, ["components", "auth-service_1"])).resolves.toBe(
      join(root, "components", "auth-service_1"),
    );
  });

  it("rejects an id segment containing a slash", async () => {
    await expect(resolveInsideRoot(root, ["components", `nested${sep}bad`])).rejects.toThrow(
      /invalid path segment/i,
    );
  });

  it("rejects an id segment equal to ..", async () => {
    await expect(resolveInsideRoot(root, ["components", ".."])).rejects.toThrow(
      /invalid path segment/i,
    );
  });

  it("rejects an id segment with an absolute prefix", async () => {
    await expect(resolveInsideRoot(root, ["components", "/etc"])).rejects.toThrow(
      /invalid path segment/i,
    );
  });

  it("rejects id segments that traverse outside root (rejected at segment level as defence-in-depth)", async () => {
    await expect(
      resolveInsideRoot(root, ["components", "auth", "..", "..", "..", "escape"]),
    ).rejects.toThrow(/invalid path segment/i);
  });

  it("rejects an existing symlink component", async () => {
    const outside = mkdtempSync(join(tmpdir(), "specifyr-outside-"));
    symlinkSync(outside, join(root, "components"));

    await expect(resolveInsideRoot(root, ["components", "auth"])).rejects.toThrow(/symbolic link/i);
    rmSync(outside, { recursive: true, force: true });
  });
});
