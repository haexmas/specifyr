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

const EMPTY_NEIGHBORS = {
  imports: [],
  importedBy: [],
  extends: [],
  extendedBy: [],
  implementsList: [],
  implementedBy: [],
};

describe("neighborsOf", () => {
  it("returns six empty lists when there are no edges", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const result = neighborsOf("a", nodes, []);
    expect(result).toEqual(EMPTY_NEIGHBORS);
  });

  it("collects a single outgoing imports edge as an import", () => {
    const nodes = [makeNode("a", "alpha"), makeNode("b", "bravo")];
    const edges = [makeEdge("e1", "a", "b")];
    const result = neighborsOf("a", nodes, edges);
    expect(result.imports.map((n) => n.id)).toEqual(["b"]);
    expect(result.importedBy).toEqual([]);
    expect(result.extends).toEqual([]);
    expect(result.extendedBy).toEqual([]);
    expect(result.implementsList).toEqual([]);
    expect(result.implementedBy).toEqual([]);
  });

  it("collects a single incoming imports edge as an importer", () => {
    const nodes = [makeNode("a", "alpha"), makeNode("b", "bravo")];
    const edges = [makeEdge("e1", "b", "a")];
    const result = neighborsOf("a", nodes, edges);
    expect(result.importedBy.map((n) => n.id)).toEqual(["b"]);
    expect(result.imports).toEqual([]);
  });

  it("collects extends edges into extends / extendedBy buckets by direction", () => {
    const nodes = [makeNode("child", "Child"), makeNode("parent", "Parent")];
    const edges = [makeEdge("e1", "child", "parent", "extends")];
    const fromChild = neighborsOf("child", nodes, edges);
    const fromParent = neighborsOf("parent", nodes, edges);
    expect(fromChild.extends.map((n) => n.id)).toEqual(["parent"]);
    expect(fromChild.extendedBy).toEqual([]);
    expect(fromParent.extendedBy.map((n) => n.id)).toEqual(["child"]);
    expect(fromParent.extends).toEqual([]);
  });

  it("collects implements edges into implementsList / implementedBy buckets by direction", () => {
    const nodes = [makeNode("impl", "Impl"), makeNode("iface", "Iface")];
    const edges = [makeEdge("e1", "impl", "iface", "implements")];
    const fromImpl = neighborsOf("impl", nodes, edges);
    const fromIface = neighborsOf("iface", nodes, edges);
    expect(fromImpl.implementsList.map((n) => n.id)).toEqual(["iface"]);
    expect(fromImpl.implementedBy).toEqual([]);
    expect(fromIface.implementedBy.map((n) => n.id)).toEqual(["impl"]);
    expect(fromIface.implementsList).toEqual([]);
  });

  it("keeps buckets separate — imports, extends, implements do not mix", () => {
    const nodes = [
      makeNode("a", "alpha"),
      makeNode("b", "bravo"),
      makeNode("c", "charlie"),
      makeNode("d", "delta"),
    ];
    const edges = [
      makeEdge("e1", "a", "b", "imports"),
      makeEdge("e2", "a", "c", "extends"),
      makeEdge("e3", "a", "d", "implements"),
    ];
    const result = neighborsOf("a", nodes, edges);
    expect(result.imports.map((n) => n.id)).toEqual(["b"]);
    expect(result.extends.map((n) => n.id)).toEqual(["c"]);
    expect(result.implementsList.map((n) => n.id)).toEqual(["d"]);
  });

  it("silently skips edges pointing to unknown nodes in ALL six buckets", () => {
    const nodes = [makeNode("a")];
    const edges = [
      makeEdge("e1", "a", "ghost", "imports"),
      makeEdge("e2", "ghost", "a", "imports"),
      makeEdge("e3", "a", "ghost", "extends"),
      makeEdge("e4", "ghost", "a", "extends"),
      makeEdge("e5", "a", "ghost", "implements"),
      makeEdge("e6", "ghost", "a", "implements"),
    ];
    expect(neighborsOf("a", nodes, edges)).toEqual(EMPTY_NEIGHBORS);
  });

  it("excludes self-loops from ALL six buckets", () => {
    const nodes = [makeNode("a")];
    const edges = [
      makeEdge("e1", "a", "a", "imports"),
      makeEdge("e2", "a", "a", "extends"),
      makeEdge("e3", "a", "a", "implements"),
    ];
    expect(neighborsOf("a", nodes, edges)).toEqual(EMPTY_NEIGHBORS);
  });

  it("returns six empty lists when the queried node is unknown", () => {
    const nodes = [makeNode("a")];
    const edges = [
      makeEdge("e1", "ghost", "a", "imports"),
      makeEdge("e2", "ghost", "a", "extends"),
      makeEdge("e3", "ghost", "a", "implements"),
    ];
    expect(neighborsOf("ghost", nodes, edges)).toEqual(EMPTY_NEIGHBORS);
  });

  it("ignores unknown edge types (forward-compat) — contribute to no bucket", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges = [makeEdge("e1", "a", "b", "calls"), makeEdge("e2", "c", "a", "custom-type")];
    expect(neighborsOf("a", nodes, edges)).toEqual(EMPTY_NEIGHBORS);
  });

  it("dedupes duplicate edges to the same neighbor per bucket", () => {
    const nodes = [makeNode("a"), makeNode("b", "bravo")];
    const edges = [
      makeEdge("e1", "a", "b", "extends"),
      makeEdge("e2", "a", "b", "extends"),
    ];
    const result = neighborsOf("a", nodes, edges);
    expect(result.extends.map((n) => n.id)).toEqual(["b"]);
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
      makeEdge("e1", "a", "b", "extends"),
      makeEdge("e2", "a", "c", "extends"),
      makeEdge("e3", "a", "d", "extends"),
      makeEdge("e4", "e", "a", "implements"),
      makeEdge("e5", "d", "a", "implements"),
      makeEdge("e6", "b", "a", "implements"),
    ];
    const result = neighborsOf("a", nodes, edges);
    expect(result.extends.map((n) => n.name)).toEqual(["bravo", "charlie", "zulu"]);
    expect(result.implementedBy.map((n) => n.name)).toEqual(["charlie", "delta", "zulu"]);
  });
});
