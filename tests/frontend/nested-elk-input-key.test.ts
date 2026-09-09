import { describe, expect, it } from "vitest";
import type { HierarchyNode } from "../../frontend/composables/build-hierarchy.js";
import type { AdapterEdge } from "../../frontend/composables/elk-adapter.js";
import { buildNestedInputKey } from "../../frontend/composables/useNestedElkLayout.js";

/** Build a leaf hierarchy node (symbol) for tests. */
function leaf(id: string, label = id): HierarchyNode {
  return { kind: "symbol", id, label, selectable: true, node: undefined, children: [] };
}

/** Build a folder hierarchy node for tests. */
function folder(id: string, children: HierarchyNode[]): HierarchyNode {
  return { kind: "folder", id, label: id, selectable: false, node: undefined, children };
}

/** Build a file hierarchy node for tests. */
function file(id: string, children: HierarchyNode[]): HierarchyNode {
  return { kind: "file", id, label: id, selectable: true, node: undefined, children };
}

/**
 * A small sample hierarchy reused across tests:
 *   folder:src
 *     file:src/a.ts
 *       sym-alpha
 *       sym-beta
 *     folder:src/nested
 *       file:src/nested/b.ts
 *         sym-gamma
 *   folder:tests
 *     file:tests/c.ts
 *       sym-delta
 */
function sampleHierarchy(): HierarchyNode[] {
  return [
    folder("folder:src", [
      file("file:src/a.ts", [leaf("sym-alpha"), leaf("sym-beta")]),
      folder("folder:src/nested", [file("file:src/nested/b.ts", [leaf("sym-gamma")])]),
    ]),
    folder("folder:tests", [file("file:tests/c.ts", [leaf("sym-delta")])]),
  ];
}

describe("buildNestedInputKey", () => {
  it("returns a stable string for empty hierarchy + empty expand set + empty edges", () => {
    const a = buildNestedInputKey([], new Set<string>(), []);
    const b = buildNestedInputKey([], new Set<string>(), []);
    expect(typeof a).toBe("string");
    expect(a).toBe(b);
  });

  it("changes when a deeply-nested folder id becomes expanded (vs. an empty expand set)", () => {
    const hierarchy = sampleHierarchy();
    const edges: AdapterEdge[] = [];
    const collapsed = buildNestedInputKey(hierarchy, new Set<string>(), edges);
    const nestedExpanded = buildNestedInputKey(
      hierarchy,
      new Set<string>(["folder:src/nested"]),
      edges,
    );
    expect(nestedExpanded).not.toBe(collapsed);
  });

  it("produces different keys for {A expanded} vs. {B expanded} with the same hierarchy shape", () => {
    const hierarchy = sampleHierarchy();
    const edges: AdapterEdge[] = [];
    const onlyA = buildNestedInputKey(hierarchy, new Set<string>(["folder:src"]), edges);
    const onlyB = buildNestedInputKey(hierarchy, new Set<string>(["folder:tests"]), edges);
    expect(onlyA).not.toBe(onlyB);
  });

  it("is order-independent over the expandedIds Set (same ids in different insertion order → same key)", () => {
    const hierarchy = sampleHierarchy();
    const edges: AdapterEdge[] = [];
    const setInOrderX = new Set<string>();
    setInOrderX.add("folder:src");
    setInOrderX.add("folder:tests");
    const setInOrderY = new Set<string>();
    setInOrderY.add("folder:tests");
    setInOrderY.add("folder:src");
    const a = buildNestedInputKey(hierarchy, setInOrderX, edges);
    const b = buildNestedInputKey(hierarchy, setInOrderY, edges);
    expect(a).toBe(b);
  });

  it("depends on edge endpoints only — different edge ids with the same endpoints yield the same key", () => {
    const hierarchy = sampleHierarchy();
    const edgesV1: AdapterEdge[] = [
      { id: "edge-1", from: "sym-alpha", to: "sym-beta" },
      { id: "edge-2", from: "sym-gamma", to: "sym-delta" },
    ];
    const edgesV2: AdapterEdge[] = [
      { id: "edge-42", from: "sym-alpha", to: "sym-beta" },
      { id: "edge-99", from: "sym-gamma", to: "sym-delta" },
    ];
    const a = buildNestedInputKey(hierarchy, new Set<string>(), edgesV1);
    const b = buildNestedInputKey(hierarchy, new Set<string>(), edgesV2);
    expect(a).toBe(b);
  });

  it("is order-independent over the edges array (endpoints sorted internally)", () => {
    const hierarchy = sampleHierarchy();
    const edgesForward: AdapterEdge[] = [
      { id: "e1", from: "sym-alpha", to: "sym-beta" },
      { id: "e2", from: "sym-gamma", to: "sym-delta" },
    ];
    const edgesReversed: AdapterEdge[] = [
      { id: "e2", from: "sym-gamma", to: "sym-delta" },
      { id: "e1", from: "sym-alpha", to: "sym-beta" },
    ];
    const a = buildNestedInputKey(hierarchy, new Set<string>(), edgesForward);
    const b = buildNestedInputKey(hierarchy, new Set<string>(), edgesReversed);
    expect(a).toBe(b);
  });

  it("includes every hierarchy node id (top-level and descendants), so adding a symbol changes the key", () => {
    const edges: AdapterEdge[] = [];
    const withoutExtra = buildNestedInputKey(sampleHierarchy(), new Set<string>(), edges);
    const hierarchyPlus = sampleHierarchy();
    // Add a new symbol under file:tests/c.ts
    hierarchyPlus[1]?.children[0]?.children.push(leaf("sym-epsilon"));
    const withExtra = buildNestedInputKey(hierarchyPlus, new Set<string>(), edges);
    expect(withExtra).not.toBe(withoutExtra);
  });
});
