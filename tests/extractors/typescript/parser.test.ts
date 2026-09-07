import { describe, expect, it } from "vitest";
import { parseTypeScript } from "../../../src/extractors/typescript/parser.js";

describe("parseTypeScript", () => {
  it("parses a trivial source into a tree", async () => {
    const tree = await parseTypeScript("export const x = 1;");
    expect(tree.rootNode.type).toBe("program");
  });

  it("parses class declarations", async () => {
    const tree = await parseTypeScript("export class Foo {}");
    const classes = tree.rootNode.descendantsOfType("class_declaration");
    expect(classes).toHaveLength(1);
  });

  it("parses interface declarations", async () => {
    const tree = await parseTypeScript("export interface Bar { x: number }");
    const interfaces = tree.rootNode.descendantsOfType("interface_declaration");
    expect(interfaces).toHaveLength(1);
  });

  it("does not throw on syntactically invalid input (produces error nodes instead)", async () => {
    const tree = await parseTypeScript("export class");
    expect(tree.rootNode.type).toBe("program");
    expect(tree.rootNode.hasError).toBe(true);
  });
});
