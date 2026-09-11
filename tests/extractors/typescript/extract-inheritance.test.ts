import { describe, expect, it } from "vitest";
import { extractInheritance } from "../../../src/extractors/typescript/extract-inheritance.js";
import { istNodeId } from "../../../src/extractors/typescript/node-id.js";

async function extract(source: string) {
  return extractInheritance({ relativePath: "src/foo.ts", source });
}

describe("extractInheritance — behavior contract", () => {
  it("returns no records for an empty file", async () => {
    expect(await extract("")).toEqual([]);
  });

  it("returns no records for an interface without a heritage clause", async () => {
    expect(await extract("export interface Foo {}\n")).toEqual([]);
  });

  it("returns no records for a class with no clauses", async () => {
    expect(await extract("export class Foo {}\n")).toEqual([]);
  });

  it("class extends class emits a single extends record with fromNodeId", async () => {
    const records = await extract("export class Foo extends Bar {}\n");
    expect(records).toEqual([
      {
        relativePath: "src/foo.ts",
        fromNodeId: istNodeId("src/foo.ts", "Foo"),
        fromSymbolName: "Foo",
        targetName: "Bar",
        edgeType: "extends",
      },
    ]);
  });

  it("abstract class extends is treated the same as class extends", async () => {
    const records = await extract("export abstract class Foo extends Bar {}\n");
    expect(records).toEqual([
      {
        relativePath: "src/foo.ts",
        fromNodeId: istNodeId("src/foo.ts", "Foo"),
        fromSymbolName: "Foo",
        targetName: "Bar",
        edgeType: "extends",
      },
    ]);
  });

  it("class implements A, B emits two implements records in source order", async () => {
    const records = await extract("export class Foo implements A, B {}\n");
    expect(records.map((r) => ({ targetName: r.targetName, edgeType: r.edgeType }))).toEqual([
      { targetName: "A", edgeType: "implements" },
      { targetName: "B", edgeType: "implements" },
    ]);
  });

  it("class extends X implements A emits both an extends and an implements record", async () => {
    const records = await extract("export class Foo extends Bar implements A {}\n");
    expect(records.map((r) => ({ targetName: r.targetName, edgeType: r.edgeType }))).toEqual([
      { targetName: "Bar", edgeType: "extends" },
      { targetName: "A", edgeType: "implements" },
    ]);
  });

  it("interface extends A, B emits two extends records", async () => {
    const records = await extract("export interface Foo extends A, B {}\n");
    expect(records.map((r) => ({ targetName: r.targetName, edgeType: r.edgeType }))).toEqual([
      { targetName: "A", edgeType: "extends" },
      { targetName: "B", edgeType: "extends" },
    ]);
  });

  it("class extends Base<T> strips the generic wrapper", async () => {
    const records = await extract("export class Foo extends Base<T> {}\n");
    expect(records).toEqual([
      {
        relativePath: "src/foo.ts",
        fromNodeId: istNodeId("src/foo.ts", "Foo"),
        fromSymbolName: "Foo",
        targetName: "Base",
        edgeType: "extends",
      },
    ]);
  });

  it("class extends Foo.Bar drops namespace-qualified targets", async () => {
    expect(await extract("export class Foo extends Bar.Baz {}\n")).toEqual([]);
  });

  it("duplicate-named class declarations get distinct fromNodeId via # suffix", async () => {
    const records = await extract(
      ["export class Foo extends Alpha {}", "class Foo extends Beta {}", ""].join("\n"),
    );
    expect(records).toEqual([
      {
        relativePath: "src/foo.ts",
        fromNodeId: istNodeId("src/foo.ts", "Foo"),
        fromSymbolName: "Foo",
        targetName: "Alpha",
        edgeType: "extends",
      },
      {
        relativePath: "src/foo.ts",
        fromNodeId: istNodeId("src/foo.ts", "Foo#2"),
        fromSymbolName: "Foo",
        targetName: "Beta",
        edgeType: "extends",
      },
    ]);
  });

  it("class implements same interface twice keeps both raw records (dedup happens in extract.ts)", async () => {
    const records = await extract("export class Foo implements Bar, Bar {}\n");
    expect(records.map((r) => r.targetName)).toEqual(["Bar", "Bar"]);
  });
});
