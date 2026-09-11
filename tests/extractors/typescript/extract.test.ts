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

describe("extractIst — imports edges", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-ist-edges-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("emits a module→module imports edge for a resolvable relative import", async () => {
    writeFileSync(join(repoPath, "a.ts"), 'import { B } from "./b";\nexport const A = 1;\n');
    writeFileSync(join(repoPath, "b.ts"), "export const B = 2;\n");

    const model = await extractIst(repoPath);
    const modules = new Map(
      model.nodes.filter((n) => n.type === "module").map((n) => [n.name, n.id]),
    );
    expect(model.edges).toHaveLength(1);
    const edge = model.edges[0];
    expect(edge?.type).toBe("imports");
    expect(edge?.from).toBe(modules.get("a.ts"));
    expect(edge?.to).toBe(modules.get("b.ts"));
    expect(edge?.id).toMatch(/^tse-[0-9a-f]{12}$/);
  });

  it("resolves .js import specifiers to the .ts source (dist-emit convention)", async () => {
    writeFileSync(join(repoPath, "a.ts"), 'import { B } from "./b.js";\n');
    writeFileSync(join(repoPath, "b.ts"), "export const B = 2;\n");

    const model = await extractIst(repoPath);
    expect(model.edges).toHaveLength(1);
  });

  it("resolves a directory index import", async () => {
    mkdirSync(join(repoPath, "sub"), { recursive: true });
    writeFileSync(join(repoPath, "a.ts"), 'import { Sub } from "./sub";\n');
    writeFileSync(join(repoPath, "sub", "index.ts"), "export const Sub = 1;\n");

    const model = await extractIst(repoPath);
    expect(model.edges).toHaveLength(1);
  });

  it("drops external and node: imports", async () => {
    writeFileSync(
      join(repoPath, "a.ts"),
      [
        'import { z } from "zod";',
        'import { readFile } from "node:fs/promises";',
        'import { B } from "./b";',
        "",
      ].join("\n"),
    );
    writeFileSync(join(repoPath, "b.ts"), "export const B = 2;\n");

    const model = await extractIst(repoPath);
    expect(model.edges).toHaveLength(1);
  });

  it("deduplicates identical from→to→type edges (multiple imports from the same module)", async () => {
    writeFileSync(
      join(repoPath, "a.ts"),
      ['import { B } from "./b";', 'import { C } from "./b";', ""].join("\n"),
    );
    writeFileSync(join(repoPath, "b.ts"), "export const B = 2;\nexport const C = 3;\n");

    const model = await extractIst(repoPath);
    expect(model.edges).toHaveLength(1);
  });

  it("returns a Model that still passes ModelSchema.parse (edges reference known nodes)", async () => {
    const { ModelSchema } = await import("../../../src/core/schemas.js");
    writeFileSync(join(repoPath, "a.ts"), 'import { B } from "./b";\n');
    writeFileSync(join(repoPath, "b.ts"), "export const B = 2;\n");
    const model = await extractIst(repoPath);
    ModelSchema.parse(model);
  });
});

describe("extractIst — inheritance edges", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "specifyr-ist-inh-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  function symbolByName(model: Awaited<ReturnType<typeof extractIst>>, name: string) {
    return model.nodes.find((n) => n.type !== "module" && n.name === name);
  }

  function inheritanceEdges(model: Awaited<ReturnType<typeof extractIst>>) {
    return model.edges.filter((e) => e.type === "extends" || e.type === "implements");
  }

  it("emits an extends edge for a class extending a same-file class", async () => {
    writeFileSync(
      join(repoPath, "a.ts"),
      ["export class Parent {}", "export class Child extends Parent {}", ""].join("\n"),
    );
    const model = await extractIst(repoPath);
    const parent = symbolByName(model, "Parent");
    const child = symbolByName(model, "Child");
    const edges = inheritanceEdges(model);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ type: "extends", from: child?.id, to: parent?.id });
  });

  it("emits an extends edge for a class extending a class in another file (named import)", async () => {
    writeFileSync(join(repoPath, "parent.ts"), "export class Parent {}\n");
    writeFileSync(
      join(repoPath, "child.ts"),
      ['import { Parent } from "./parent";', "export class Child extends Parent {}", ""].join("\n"),
    );
    const model = await extractIst(repoPath);
    const parent = symbolByName(model, "Parent");
    const child = symbolByName(model, "Child");
    const edges = inheritanceEdges(model);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ type: "extends", from: child?.id, to: parent?.id });
  });

  it("emits two implements edges for a class implementing a local interface and an imported one", async () => {
    writeFileSync(join(repoPath, "iface.ts"), "export interface Remote {}\n");
    writeFileSync(
      join(repoPath, "foo.ts"),
      [
        'import { Remote } from "./iface";',
        "export interface Local {}",
        "export class Foo implements Local, Remote {}",
        "",
      ].join("\n"),
    );
    const model = await extractIst(repoPath);
    const foo = symbolByName(model, "Foo");
    const local = symbolByName(model, "Local");
    const remote = symbolByName(model, "Remote");
    const edges = inheritanceEdges(model);
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.type === "implements" && e.from === foo?.id)).toBe(true);
    const tos = edges.map((e) => e.to).sort();
    expect(tos).toEqual([local?.id, remote?.id].sort());
  });

  it("emits two extends edges for an interface extending two interfaces", async () => {
    writeFileSync(join(repoPath, "a.ts"), "export interface A {}\n");
    writeFileSync(join(repoPath, "b.ts"), "export interface B {}\n");
    writeFileSync(
      join(repoPath, "c.ts"),
      [
        'import { A } from "./a";',
        'import { B } from "./b";',
        "export interface C extends A, B {}",
        "",
      ].join("\n"),
    );
    const model = await extractIst(repoPath);
    const c = symbolByName(model, "C");
    const a = symbolByName(model, "A");
    const b = symbolByName(model, "B");
    const edges = inheritanceEdges(model);
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.type === "extends" && e.from === c?.id)).toBe(true);
    const tos = edges.map((e) => e.to).sort();
    expect(tos).toEqual([a?.id, b?.id].sort());
  });

  it("resolves through a transitive aliased re-export chain", async () => {
    writeFileSync(join(repoPath, "deep.ts"), "export class Deep {}\n");
    writeFileSync(join(repoPath, "mid.ts"), 'export { Deep as Mid } from "./deep";\n');
    writeFileSync(
      join(repoPath, "child.ts"),
      ['import { Mid } from "./mid";', "export class Child extends Mid {}", ""].join("\n"),
    );
    const model = await extractIst(repoPath);
    const deep = symbolByName(model, "Deep");
    const child = symbolByName(model, "Child");
    const edges = inheritanceEdges(model);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ type: "extends", from: child?.id, to: deep?.id });
  });

  it("does not hang or emit edges on a cyclic re-export chain", async () => {
    writeFileSync(join(repoPath, "a.ts"), 'export { B as A } from "./b";\n');
    writeFileSync(join(repoPath, "b.ts"), 'export { A as B } from "./a";\n');
    writeFileSync(
      join(repoPath, "child.ts"),
      ['import { A } from "./a";', "export class Child extends A {}", ""].join("\n"),
    );
    const model = await extractIst(repoPath);
    expect(inheritanceEdges(model)).toEqual([]);
  });

  it("emits no inheritance edge and does not crash when extending an unknown external", async () => {
    writeFileSync(
      join(repoPath, "child.ts"),
      [
        'import { Something } from "some-external-package";',
        "export class Child extends Something {}",
        "",
      ].join("\n"),
    );
    const model = await extractIst(repoPath);
    expect(inheritanceEdges(model)).toEqual([]);
  });

  it("dedupes a class that implements the same interface twice", async () => {
    writeFileSync(
      join(repoPath, "a.ts"),
      ["export interface Bar {}", "export class Foo implements Bar, Bar {}", ""].join("\n"),
    );
    const model = await extractIst(repoPath);
    expect(inheritanceEdges(model)).toHaveLength(1);
  });

  it("does not emit inheritance edges to functions, enums, type aliases or private declarations", async () => {
    writeFileSync(
      join(repoPath, "targets.ts"),
      [
        "export function Foo() {}",
        "export enum Bar { X }",
        "export type Baz = number;",
        "class Priv {}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(repoPath, "child.ts"),
      [
        'import { Foo, Bar, Baz } from "./targets";',
        "export class A extends Foo {}",
        "export class B extends Bar {}",
        "export class C extends Baz {}",
        "export class D extends Priv {}",
        "",
      ].join("\n"),
    );
    const model = await extractIst(repoPath);
    expect(inheritanceEdges(model)).toEqual([]);
  });

  it("gives duplicate-named source declarations their own extends edge with distinct fromNodeId", async () => {
    writeFileSync(join(repoPath, "alpha.ts"), "export class Alpha {}\n");
    writeFileSync(join(repoPath, "beta.ts"), "export class Beta {}\n");
    writeFileSync(
      join(repoPath, "foo.ts"),
      [
        'import { Alpha } from "./alpha";',
        'import { Beta } from "./beta";',
        "export class Foo extends Alpha {}",
        "class Foo extends Beta {}",
        "",
      ].join("\n"),
    );
    const model = await extractIst(repoPath);
    const edges = inheritanceEdges(model);
    expect(edges).toHaveLength(2);
    const fromIds = edges.map((e) => e.from).sort();
    expect(new Set(fromIds).size).toBe(2);
  });

  it("resolves through a source-less local re-export (`export { X };` after `class X {}`)", async () => {
    writeFileSync(
      join(repoPath, "parent.ts"),
      ["class Parent {}", "export { Parent };", ""].join("\n"),
    );
    writeFileSync(
      join(repoPath, "child.ts"),
      ['import { Parent } from "./parent";', "export class Child extends Parent {}", ""].join("\n"),
    );
    const model = await extractIst(repoPath);
    const parent = symbolByName(model, "Parent");
    const child = symbolByName(model, "Child");
    const edges = inheritanceEdges(model);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ type: "extends", from: child?.id, to: parent?.id });
  });

  it("resolves through a source-less aliased local re-export (`export { X as Y };`)", async () => {
    writeFileSync(
      join(repoPath, "parent.ts"),
      ["class Parent {}", "export { Parent as PublicParent };", ""].join("\n"),
    );
    writeFileSync(
      join(repoPath, "child.ts"),
      [
        'import { PublicParent } from "./parent";',
        "export class Child extends PublicParent {}",
        "",
      ].join("\n"),
    );
    const model = await extractIst(repoPath);
    const parent = symbolByName(model, "Parent");
    const child = symbolByName(model, "Child");
    const edges = inheritanceEdges(model);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ type: "extends", from: child?.id, to: parent?.id });
  });

  it("does not emit an inheritance edge for default-import inheritance (out of scope per spec)", async () => {
    writeFileSync(join(repoPath, "parent.ts"), "export default class Parent {}\n");
    writeFileSync(
      join(repoPath, "child.ts"),
      ['import Parent from "./parent";', "export class Child extends Parent {}", ""].join("\n"),
    );
    const model = await extractIst(repoPath);
    expect(inheritanceEdges(model)).toEqual([]);
  });

  it("is deterministic — repeat extraction on the same repo yields identical edge sets", async () => {
    writeFileSync(join(repoPath, "parent.ts"), "export class Parent {}\n");
    writeFileSync(
      join(repoPath, "child.ts"),
      ['import { Parent } from "./parent";', "export class Child extends Parent {}", ""].join("\n"),
    );
    const first = await extractIst(repoPath);
    const second = await extractIst(repoPath);
    const sortById = (edges: typeof first.edges) =>
      [...edges].sort((a, b) => a.id.localeCompare(b.id));
    expect(sortById(second.edges)).toEqual(sortById(first.edges));
  });
});
