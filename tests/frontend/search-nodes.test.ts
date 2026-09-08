import type { Node } from "specifyr";
import { describe, expect, it } from "vitest";
import { matchNodes } from "../../frontend/composables/search-nodes.js";

/** Create a model node for search tests. */
function makeNode(id: string, name: string = id, path?: string): Node {
  const node: Node = { id, type: "module", name, classes: [] };
  if (path !== undefined) node.path = path;
  return node;
}

describe("matchNodes", () => {
  it("returns an empty array when the query is empty", () => {
    const nodes = [makeNode("a", "alpha"), makeNode("b", "bravo")];
    expect(matchNodes("", nodes)).toEqual([]);
  });

  it("returns an empty array when the query is whitespace only", () => {
    const nodes = [makeNode("a", "alpha"), makeNode("b", "bravo")];
    expect(matchNodes("   ", nodes)).toEqual([]);
  });

  it("trims leading and trailing whitespace before matching", () => {
    const nodes = [makeNode("a", "alpha"), makeNode("b", "bravo")];
    expect(matchNodes("  alp  ", nodes).map((n) => n.id)).toEqual(["a"]);
  });

  it("matches names case-insensitively as a substring", () => {
    const nodes = [makeNode("a", "AlphaModule"), makeNode("b", "bravo")];
    expect(matchNodes("PHAMOD", nodes).map((n) => n.id)).toEqual(["a"]);
  });

  it("matches paths case-insensitively when the name does not match", () => {
    const nodes = [
      makeNode("a", "alpha", "src/Foo/Bar.ts"),
      makeNode("b", "bravo", "src/quux.ts"),
    ];
    expect(matchNodes("foo/bar", nodes).map((n) => n.id)).toEqual(["a"]);
  });

  it("does not crash on nodes without a path field", () => {
    const nodes = [makeNode("a", "alpha"), makeNode("b", "bravo")];
    expect(() => matchNodes("alp", nodes)).not.toThrow();
    expect(matchNodes("alp", nodes).map((n) => n.id)).toEqual(["a"]);
  });

  it("returns multiple matches in the input order", () => {
    const nodes = [
      makeNode("c", "zulu"),
      makeNode("a", "alpha"),
      makeNode("b", "alphabet"),
      makeNode("d", "delta"),
    ];
    expect(matchNodes("alp", nodes).map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("returns an empty array when nothing matches", () => {
    const nodes = [
      makeNode("a", "alpha", "src/a.ts"),
      makeNode("b", "bravo", "src/b.ts"),
    ];
    expect(matchNodes("xyz", nodes)).toEqual([]);
  });
});
