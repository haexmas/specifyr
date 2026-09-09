import type { Edge } from "specifyr";
import { describe, expect, it } from "vitest";
import {
  aggregateEdges,
  resolveVisibleEndpoint,
} from "../../frontend/composables/edge-aggregation.js";

/** Build a parent map from `{ child: parent | undefined }` pairs. */
function parentMap(pairs: Record<string, string | undefined>): Map<string, string | undefined> {
  return new Map(Object.entries(pairs));
}

/** Build a set of visible ids. */
function visible(...ids: string[]): Set<string> {
  return new Set(ids);
}

/** Create an edge for aggregation tests. */
function makeEdge(id: string, from: string, to: string, type = "imports"): Edge {
  return { id, from, to, type };
}

describe("resolveVisibleEndpoint", () => {
  it("returns the id itself when it is a top-level visible id", () => {
    const parents = parentMap({ root: undefined });
    expect(resolveVisibleEndpoint("root", parents, visible("root"))).toBe("root");
  });

  it("returns the child id when the visible child is a direct descendant of a visible parent", () => {
    const parents = parentMap({ parent: undefined, child: "parent" });
    expect(resolveVisibleEndpoint("child", parents, visible("parent", "child"))).toBe("child");
  });

  it("returns the parent id when the child is not visible but the parent is", () => {
    const parents = parentMap({ parent: undefined, child: "parent" });
    expect(resolveVisibleEndpoint("child", parents, visible("parent"))).toBe("parent");
  });

  it("walks the chain up to the top-level visible ancestor", () => {
    const parents = parentMap({
      top: undefined,
      mid: "top",
      leaf: "mid",
    });
    expect(resolveVisibleEndpoint("leaf", parents, visible("top"))).toBe("top");
  });

  it("returns self when the whole chain is visible", () => {
    const parents = parentMap({
      top: undefined,
      mid: "top",
      leaf: "mid",
    });
    expect(resolveVisibleEndpoint("leaf", parents, visible("top", "mid", "leaf"))).toBe("leaf");
  });

  it("returns undefined when the id is unknown to parentOf", () => {
    const parents = parentMap({ root: undefined });
    expect(resolveVisibleEndpoint("ghost", parents, visible("root"))).toBeUndefined();
  });

  it("returns undefined when no ancestor along the chain is visible", () => {
    const parents = parentMap({
      top: undefined,
      mid: "top",
      leaf: "mid",
    });
    expect(resolveVisibleEndpoint("leaf", parents, visible())).toBeUndefined();
  });
});

describe("aggregateEdges", () => {
  it("returns an empty array for empty edges", () => {
    expect(aggregateEdges([], parentMap({}), visible())).toEqual([]);
  });

  it("keeps a raw edge id when both endpoints are already visible and unique", () => {
    const parents = parentMap({ a: undefined, b: undefined });
    const edges = [makeEdge("e1", "a", "b")];
    const result = aggregateEdges(edges, parents, visible("a", "b"));
    expect(result).toEqual([{ id: "e1", from: "a", to: "b", count: 1 }]);
  });

  it("resolves a hidden endpoint up to its visible folder and synthesizes the aggregate id", () => {
    const parents = parentMap({
      folder: undefined,
      "folder/file": "folder",
      target: undefined,
    });
    const edges = [makeEdge("e1", "folder/file", "target")];
    const result = aggregateEdges(edges, parents, visible("folder", "target"));
    expect(result).toEqual([{ id: "agg:folder->target", from: "folder", to: "target", count: 1 }]);
  });

  it("emits two aggregates when children of the same collapsed folder point to different visible targets", () => {
    const parents = parentMap({
      folder: undefined,
      "folder/a": "folder",
      "folder/b": "folder",
      x: undefined,
      y: undefined,
    });
    const edges = [makeEdge("e1", "folder/a", "x"), makeEdge("e2", "folder/b", "y")];
    const result = aggregateEdges(edges, parents, visible("folder", "x", "y"));
    expect(result).toEqual([
      { id: "agg:folder->x", from: "folder", to: "x", count: 1 },
      { id: "agg:folder->y", from: "folder", to: "y", count: 1 },
    ]);
  });

  it("dedupes two edges between the same collapsed pair into one aggregate with count 2", () => {
    const parents = parentMap({
      src: undefined,
      "src/a": "src",
      "src/b": "src",
      dst: undefined,
      "dst/x": "dst",
      "dst/y": "dst",
    });
    const edges = [makeEdge("e1", "src/a", "dst/x"), makeEdge("e2", "src/b", "dst/y")];
    const result = aggregateEdges(edges, parents, visible("src", "dst"));
    expect(result).toEqual([{ id: "agg:src->dst", from: "src", to: "dst", count: 2 }]);
  });

  it("drops edges whose endpoints resolve to the same visible container (no self-loops)", () => {
    const parents = parentMap({
      file: undefined,
      "file/sym1": "file",
      "file/sym2": "file",
    });
    const edges = [makeEdge("e1", "file/sym1", "file/sym2")];
    const result = aggregateEdges(edges, parents, visible("file"));
    expect(result).toEqual([]);
  });

  it("silently drops edges whose endpoint is unknown to parentOf", () => {
    const parents = parentMap({ a: undefined });
    const edges = [makeEdge("e1", "a", "ghost"), makeEdge("e2", "ghost", "a")];
    expect(() => aggregateEdges(edges, parents, visible("a"))).not.toThrow();
    expect(aggregateEdges(edges, parents, visible("a"))).toEqual([]);
  });

  it("is deterministic — same input yields identical output on every call", () => {
    const parents = parentMap({
      src: undefined,
      "src/a": "src",
      "src/b": "src",
      dst: undefined,
      other: undefined,
    });
    const edges = [
      makeEdge("e1", "src/b", "dst"),
      makeEdge("e2", "src/a", "other"),
      makeEdge("e3", "src/a", "dst"),
    ];
    const visibleIds = visible("src", "dst", "other");
    const first = aggregateEdges(edges, parents, visibleIds);
    const second = aggregateEdges(edges, parents, visibleIds);
    expect(second).toEqual(first);
    expect(first.map((e) => e.id)).toEqual([...first.map((e) => e.id)].sort());
  });

  it("preserves direction — A->B and B->A between collapsed pairs stay separate", () => {
    const parents = parentMap({
      p: undefined,
      "p/a": "p",
      q: undefined,
      "q/b": "q",
    });
    const edges = [makeEdge("e1", "p/a", "q/b"), makeEdge("e2", "q/b", "p/a")];
    const result = aggregateEdges(edges, parents, visible("p", "q"));
    expect(result).toEqual([
      { id: "agg:p->q", from: "p", to: "q", count: 1 },
      { id: "agg:q->p", from: "q", to: "p", count: 1 },
    ]);
  });

  it("dedupes two pass-through edges to one synthesized aggregate — the first raw id must NOT be reused", () => {
    // Guards against a future "helpfully keep the first raw id when count > 1"
    // regression. Two edges with different raw ids, both endpoints already
    // visible: must dedup into one aggregate whose id is the synthesized
    // `agg:...` form (not either raw id) and whose count is 2.
    const parents = parentMap({ src: undefined, dst: undefined });
    const edges = [makeEdge("raw-first", "src", "dst"), makeEdge("raw-second", "src", "dst")];
    const result = aggregateEdges(edges, parents, visible("src", "dst"));
    expect(result).toEqual([{ id: "agg:src->dst", from: "src", to: "dst", count: 2 }]);
  });
});
