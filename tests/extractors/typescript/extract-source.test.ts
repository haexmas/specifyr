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

  it("emits a class node for an abstract class", async () => {
    const nodes = await extractSource({
      relativePath: "src/abstract.ts",
      source: "export abstract class Base {}\n",
    });
    const cls = nodes.find((n) => n.type === "class");
    expect(cls?.name).toBe("Base");
  });

  it("emits a class node for a `declare class` ambient declaration", async () => {
    const nodes = await extractSource({
      relativePath: "src/ambient.d.ts",
      source: "declare class Global {}\n",
    });
    const cls = nodes.find((n) => n.type === "class");
    expect(cls?.name).toBe("Global");
  });

  it("emits a class node for an exported ambient declaration", async () => {
    const nodes = await extractSource({
      relativePath: "src/exported-ambient.d.ts",
      source: "export declare class ExportedGlobal {}\n",
    });
    const cls = nodes.find((n) => n.type === "class");
    expect(cls?.name).toBe("ExportedGlobal");
  });

  it("assigns unique deterministic IDs to merged declarations and overloads", async () => {
    const relativePath = "src/merged.ts";
    const nodes = await extractSource({
      relativePath,
      source: `
        export interface Shared {}
        export class Shared {}
        export function overloaded(value: string): string;
        export function overloaded(value: number): number;
        export function overloaded(value: string | number) { return String(value); }
      `,
    });
    const declarations = nodes.filter((node) => node.type !== "module");
    expect(declarations.map((node) => node.name)).toEqual([
      "Shared",
      "Shared",
      "overloaded",
      "overloaded",
      "overloaded",
    ]);
    expect(new Set(declarations.map((node) => node.id)).size).toBe(declarations.length);
    expect(declarations.map((node) => node.id)).toEqual([
      istNodeId(relativePath, "Shared"),
      istNodeId(relativePath, "Shared#2"),
      istNodeId(relativePath, "overloaded"),
      istNodeId(relativePath, "overloaded#2"),
      istNodeId(relativePath, "overloaded#3"),
    ]);
  });

  it("emits a class node for `export default class`", async () => {
    const nodes = await extractSource({
      relativePath: "src/default.ts",
      source: "export default class Main {}\n",
    });
    const cls = nodes.find((n) => n.type === "class");
    expect(cls?.name).toBe("Main");
  });

  it("does not emit anything for namespaces (deferred)", async () => {
    const nodes = await extractSource({
      relativePath: "src/ns.ts",
      source: "namespace Foo { export class Bar {} }\n",
    });
    // Only the module node — namespace and its Bar inside are deferred.
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.type).toBe("module");
  });

  it("extracts top-level declarations from a .tsx file with JSX in a function body", async () => {
    const nodes = await extractSource({
      relativePath: "src/App.tsx",
      source: [
        "export interface AppProps { title: string }",
        "export function App(props: AppProps) {",
        "  return <div>{props.title}</div>;",
        "}",
      ].join("\n"),
    });
    const names = nodes.map((n) => n.name).sort();
    expect(names).toEqual(["App", "AppProps", "src/App.tsx"]);
  });

  it("sets path on a symbol node to the file's relative path", async () => {
    const nodes = await extractSource({
      relativePath: "src/auth.ts",
      source: "export class AuthService {}\n",
    });
    const classNode = nodes.find((n) => n.type === "class");
    expect(classNode?.path).toBe("src/auth.ts");
  });

  it("sets path on every symbol type in a file", async () => {
    const source = `
      export interface User {}
      export type UserId = string;
      export enum Role { admin, user }
      export function login() {}
    `;
    const nodes = await extractSource({ relativePath: "src/all.ts", source });
    const symbols = nodes.filter((n) => n.type !== "module");
    expect(symbols).toHaveLength(4);
    for (const symbol of symbols) {
      expect(symbol.path).toBe("src/all.ts");
    }
  });

  it("does not set path on the module node itself", async () => {
    const nodes = await extractSource({
      relativePath: "src/auth.ts",
      source: "export class AuthService {}\n",
    });
    const moduleNode = nodes.find((n) => n.type === "module");
    expect(moduleNode?.path).toBeUndefined();
  });
});
