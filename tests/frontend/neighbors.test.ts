import type { Edge, Node } from "specifyr";
import { describe, expect, it } from "vitest";
import { neighborsOf } from "../../frontend/composables/neighbors.js";

/** Create a model node for neighbor traversal tests. */
function makeNode(id: string, name: string = id, type = "module"): Node {
  return { id, type, name, classes: [] };
}

/** Create a model edge for neighbor traversal tests. */
function makeEdge(id: string, from: string, to: string, type = "imports"): Edge {
  return { id, from, to, type };
}

describe("neighborsOf", () => {
  it("returns empty lists when there are no edges", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const result = neighborsOf("a", nodes, []);
    expect(result).toEqual({ imports: [], importedBy: [] });
  });

  it("collects a single outgoing imports edge as an import", () => {
    const nodes = [makeNode("a", "alpha"), makeNode("b", "bravo")];
    const edges = [makeEdge("e1", "a", "b")];
    const result = neighborsOf("a", nodes, edges);
    expect(result.imports.map((n) => n.id)).toEqual(["b"]);
    expect(result.importedBy).toEqual([]);
  });

  it("collects a single incoming imports edge as an importer", () => {
    const nodes = [makeNode("a", "alpha"), makeNode("b", "bravo")];
    const edges = [makeEdge("e1", "b", "a")];
    const result = neighborsOf("a", nodes, edges);
    expect(result.importedBy.map((n) => n.id)).toEqual(["b"]);
    expect(result.imports).toEqual([]);
  });

  it("ignores edges whose type is not 'imports'", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges = [makeEdge("e1", "a", "b", "extends"), makeEdge("e2", "c", "a", "calls")];
    const result = neighborsOf("a", nodes, edges);
    expect(result).toEqual({ imports: [], importedBy: [] });
  });

  it("dedupes duplicate edges to the same neighbor", () => {
    const nodes = [makeNode("a"), makeNode("b", "bravo")];
    const edges = [makeEdge("e1", "a", "b"), makeEdge("e2", "a", "b")];
    const result = neighborsOf("a", nodes, edges);
    expect(result.imports.map((n) => n.id)).toEqual(["b"]);
  });

  it("silently skips edges pointing to unknown nodes", () => {
    const nodes = [makeNode("a")];
    const edges = [makeEdge("e1", "a", "ghost"), makeEdge("e2", "ghost", "a")];
    expect(() => neighborsOf("a", nodes, edges)).not.toThrow();
    const result = neighborsOf("a", nodes, edges);
    expect(result).toEqual({ imports: [], importedBy: [] });
  });

  it("returns empty lists when the queried node is unknown", () => {
    const nodes = [makeNode("a")];
    const edges = [makeEdge("e1", "ghost", "a"), makeEdge("e2", "a", "ghost")];
    expect(neighborsOf("ghost", nodes, edges)).toEqual({ imports: [], importedBy: [] });
  });

  it("excludes self-loops from both lists", () => {
    const nodes = [makeNode("a")];
    const edges = [makeEdge("e1", "a", "a")];
    const result = neighborsOf("a", nodes, edges);
    expect(result).toEqual({ imports: [], importedBy: [] });
  });

  it("sorts each list by node name ascending", () => {
    const nodes = [
      makeNode("a", "alpha"),
      makeNode("b", "charlie"),
      makeNode("c", "bravo"),
      makeNode("d", "zulu"),
      makeNode("e", "delta"),
    ];
    const edges = [
      makeEdge("e1", "a", "b"),
      makeEdge("e2", "a", "c"),
      makeEdge("e3", "a", "d"),
      makeEdge("e4", "e", "a"),
      makeEdge("e5", "d", "a"),
      makeEdge("e6", "b", "a"),
    ];
    const result = neighborsOf("a", nodes, edges);
    expect(result.imports.map((n) => n.name)).toEqual(["bravo", "charlie", "zulu"]);
    expect(result.importedBy.map((n) => n.name)).toEqual(["charlie", "delta", "zulu"]);
  });
});
