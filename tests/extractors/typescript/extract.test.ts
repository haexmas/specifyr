import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractIst } from "../../../src/extractors/typescript/extract.js";

describe("extractIst", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-ist-ts-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("returns an empty model when the repo has no .ts files", async () => {
    const model = await extractIst(repoPath);
    expect(model.meta.source).toBe("ist");
    expect(model.nodes).toEqual([]);
    expect(model.edges).toEqual([]);
  });

  it("emits one module node per .ts file plus its top-level declarations", async () => {
    mkdirSync(join(repoPath, "src"), { recursive: true });
    writeFileSync(join(repoPath, "src", "auth.ts"), "export class AuthService {}\n");
    writeFileSync(
      join(repoPath, "src", "types.ts"),
      "export interface User {}\nexport type UserId = string;\n",
    );

    const model = await extractIst(repoPath);
    const byType = new Map<string, string[]>();
    for (const node of model.nodes) {
      const list = byType.get(node.type) ?? [];
      list.push(node.name);
      byType.set(node.type, list);
    }
    expect(byType.get("module")?.sort()).toEqual(["src/auth.ts", "src/types.ts"]);
    expect(byType.get("class")).toEqual(["AuthService"]);
    expect(byType.get("interface")).toEqual(["User"]);
    expect(byType.get("type-alias")).toEqual(["UserId"]);
  });

  it("skips node_modules and other noise dirs", async () => {
    mkdirSync(join(repoPath, "node_modules"), { recursive: true });
    writeFileSync(join(repoPath, "node_modules", "x.ts"), "export class Junk {}\n");
    writeFileSync(join(repoPath, "keep.ts"), "export class Keep {}\n");

    const model = await extractIst(repoPath);
    const names = model.nodes.map((n) => n.name);
    expect(names).toContain("Keep");
    expect(names).not.toContain("Junk");
  });

  it("returns a Model that passes ModelSchema.parse", async () => {
    const { ModelSchema } = await import("../../../src/core/schemas.js");
    writeFileSync(join(repoPath, "one.ts"), "export class One {}\n");
    const model = await extractIst(repoPath);
    ModelSchema.parse(model);
  });
});
