import { describe, expect, it } from "vitest";
import { elkResultToPositions, modelToElkGraph } from "../../frontend/composables/elk-adapter.js";

describe("modelToElkGraph", () => {
  it("returns a root graph with the rectpacking algorithm and top-down direction", () => {
    const graph = modelToElkGraph({ nodes: [], edges: [] });
    expect(graph.id).toBe("root");
    expect(graph.layoutOptions?.["elk.algorithm"]).toBe("rectpacking");
    expect(graph.layoutOptions?.["elk.direction"]).toBe("DOWN");
  });

  it("maps each node to an ElkNode with fixed width/height defaults", () => {
    const graph = modelToElkGraph({
      nodes: [{ id: "ts-aaa", label: "src/foo.ts" }],
      edges: [],
    });
    expect(graph.children).toHaveLength(1);
    const child = graph.children?.[0];
    expect(child?.id).toBe("ts-aaa");
    expect(child?.width).toBeGreaterThan(0);
    expect(child?.height).toBeGreaterThan(0);
  });

  it("maps each edge to an ElkEdge with sources/targets", () => {
    const graph = modelToElkGraph({
      nodes: [
        { id: "ts-aaa", label: "a" },
        { id: "ts-bbb", label: "b" },
      ],
      edges: [{ id: "tse-xyz", from: "ts-aaa", to: "ts-bbb" }],
    });
    expect(graph.edges).toHaveLength(1);
    const edge = graph.edges?.[0];
    expect(edge?.id).toBe("tse-xyz");
    expect(edge?.sources).toEqual(["ts-aaa"]);
    expect(edge?.targets).toEqual(["ts-bbb"]);
  });

  it("drops edges whose from or to references a missing node", () => {
    const graph = modelToElkGraph({
      nodes: [{ id: "ts-aaa", label: "a" }],
      edges: [{ id: "tse-ghost", from: "ts-aaa", to: "ts-missing" }],
    });
    expect(graph.edges).toEqual([]);
  });

  it("uses the sizeOf override per node, falling back to defaults when it returns undefined", () => {
    const graph = modelToElkGraph(
      {
        nodes: [
          { id: "ts-aaa", label: "a" },
          { id: "ts-bbb", label: "b" },
        ],
        edges: [],
      },
      (id) => (id === "ts-aaa" ? { width: 400, height: 300 } : undefined),
    );
    const byId = new Map(graph.children.map((c) => [c.id, c]));
    expect(byId.get("ts-aaa")).toMatchObject({ width: 400, height: 300 });
    // ts-bbb has no override → default NODE_WIDTH/NODE_HEIGHT from the adapter.
    const bbb = byId.get("ts-bbb");
    expect(bbb?.width).toBeGreaterThan(0);
    expect(bbb?.height).toBeGreaterThan(0);
    expect(bbb?.width).not.toBe(400);
    expect(bbb?.height).not.toBe(300);
  });
});

describe("elkResultToPositions", () => {
  it("returns an empty map for a graph with no children", () => {
    const positions = elkResultToPositions({ id: "root", children: [] });
    expect(positions.size).toBe(0);
  });

  it("returns a Map of nodeId -> {x, y} for each child", () => {
    const positions = elkResultToPositions({
      id: "root",
      children: [
        { id: "ts-aaa", x: 10, y: 20, width: 200, height: 60 },
        { id: "ts-bbb", x: 300, y: 20, width: 200, height: 60 },
      ],
    });
    expect(positions.size).toBe(2);
    expect(positions.get("ts-aaa")).toEqual({ x: 10, y: 20 });
    expect(positions.get("ts-bbb")).toEqual({ x: 300, y: 20 });
  });

  it("falls back to {x:0, y:0} for a child ELK did not position", () => {
    const positions = elkResultToPositions({
      id: "root",
      children: [{ id: "ts-aaa", width: 200, height: 60 }],
    });
    expect(positions.get("ts-aaa")).toEqual({ x: 0, y: 0 });
  });
});
