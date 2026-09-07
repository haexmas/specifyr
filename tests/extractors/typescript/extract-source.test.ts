import { describe, expect, it } from "vitest";
import { extractSource } from "../../../src/extractors/typescript/extract-source.js";
import { istNodeId } from "../../../src/extractors/typescript/node-id.js";

describe("extractSource", () => {
  it("emits exactly one module node for an empty file", async () => {
    const nodes = await extractSource({ relativePath: "src/empty.ts", source: "" });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.type).toBe("module");
    expect(nodes[0]?.name).toBe("src/empty.ts");
    expect(nodes[0]?.id).toBe(istNodeId("src/empty.ts", ""));
  });

  it("emits a class node for a top-level class", async () => {
    const nodes = await extractSource({
      relativePath: "src/auth.ts",
      source: "export class AuthService {}\n",
    });
    const classNode = nodes.find((n) => n.type === "class");
    expect(classNode).toBeDefined();
    expect(classNode?.name).toBe("AuthService");
    expect(classNode?.id).toBe(istNodeId("src/auth.ts", "AuthService"));
  });

  it("emits interface / type-alias / enum / function nodes", async () => {
    const source = `
      export interface User {}
      export type UserId = string;
      export enum Role { admin, user }
      export function login() {}
    `;
    const nodes = await extractSource({ relativePath: "src/all.ts", source });
    const byType = new Set(nodes.map((n) => n.type));
    expect(byType).toContain("module");
    expect(byType).toContain("interface");
    expect(byType).toContain("type-alias");
    expect(byType).toContain("enum");
    expect(byType).toContain("function");
    expect(nodes).toHaveLength(5);
  });

  it("does NOT emit nested declarations (methods, inner classes, inner functions)", async () => {
    const source = `
      export class Outer {
        method() {}
      }
      function outerFn() {
        function inner() {}
      }
    `;
    const nodes = await extractSource({ relativePath: "src/nested.ts", source });
    const names = nodes.map((n) => n.name).sort();
    expect(names).toEqual(["Outer", "outerFn", "src/nested.ts"]);
  });

  it("uses the file path as the module node's name", async () => {
    const nodes = await extractSource({ relativePath: "src/deep/module.ts", source: "" });
    expect(nodes[0]?.name).toBe("src/deep/module.ts");
  });
});
