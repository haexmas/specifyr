import { type Ref, computed, ref, watchEffect } from "vue";

import { type HierarchyNode, buildParentMap } from "./build-hierarchy.js";
import { aggregateEdges } from "./edge-aggregation.js";
import type { AdapterEdge, AdapterNode, SizeOf } from "./elk-adapter.js";
import { layoutContainer } from "./layout-container.js";

export const BADGE_WIDTH = 160;
export const BADGE_HEIGHT = 40;
/**
 * Dimensions used as an ELK size hint / fallback for top-level wrappers.
 * Wrappers grow to fit their children's bottom-up ELK bounding box; ELK
 * still uses these as minimums when spacing top-level wrappers apart.
 */
export const EXPANDED_CELL_WIDTH = 900;
export const EXPANDED_CELL_HEIGHT = 720;
/** Reserved space at the top of an expanded wrapper for its own header/label. */
export const HEADER_HEIGHT = 28;
/** Inner padding around scoped ELK children inside an expanded wrapper. */
export const CONTAINER_PADDING = 12;

export interface NestedLayoutEntry {
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
}

export interface UseNestedElkLayoutInput {
  hierarchy: Ref<HierarchyNode[]>;
  expandedIds: Ref<Set<string>>;
  edges: Ref<AdapterEdge[]>;
}

export interface UseNestedElkLayoutResult {
  layout: Ref<Map<string, NestedLayoutEntry>>;
  pending: Ref<boolean>;
  error: Ref<Error | undefined>;
}

/**
 * Recursively collect every node id in a hierarchy in a stable order
 * (depth-first, in the order the caller built the tree). The caller sorts
 * the flat list before hashing so tree ordering does not sneak into the
 * key — only the id membership does.
 */
function collectAllIds(hierarchy: readonly HierarchyNode[], out: string[]): void {
  for (const entry of hierarchy) {
    out.push(entry.id);
    if (entry.children.length > 0) collectAllIds(entry.children, out);
  }
}

/**
 * Stable string that fully describes the layout inputs. Two calls with
 * semantically equal inputs — same hierarchy shape/ids, same expanded set
 * (regardless of Set insertion order), same edge endpoints (regardless of
 * edge ids or array order) — return the same string. Any nested folder
 * toggling its expand state changes this key because every descendant id
 * is included and each id's expanded flag is part of the payload.
 */
export function buildNestedInputKey(
  hierarchy: readonly HierarchyNode[],
  expandedIds: ReadonlySet<string>,
  edges: readonly AdapterEdge[],
): string {
  const allIds: string[] = [];
  collectAllIds(hierarchy, allIds);
  allIds.sort();
  const nodesPart = allIds.map((id) => `${id}:${expandedIds.has(id) ? "1" : "0"}`);
  const edgesPart = edges.map((e) => `${e.from}->${e.to}`).sort();
  return JSON.stringify({ n: nodesPart, e: edgesPart });
}

/**
 * Return the outer size for an expanded container from the bounding box its
 * scoped ELK call produced for the children. Wrappers grow to fit — the
 * cell dimensions (EXPANDED_CELL_WIDTH/HEIGHT) reserve the *minimum* grid
 * slot but do not clip a bigger wrapper. Clipping would need Vue Flow to
 * render children inside the parent node's DOM subtree, which it does not
 * (children are DOM siblings positioned by transform); a CSS `overflow`
 * cap on the wrapper node therefore only shows a scrollbar that scrolls
 * nothing while children still render outside its border. Grow-to-fit
 * keeps the render honest — the top-level grid is what protects sibling
 * anchoring, not the wrapper's own size.
 */
function wrapperSizeForContent(contentSize: {
  width: number;
  height: number;
}): { width: number; height: number } {
  return {
    width: contentSize.width + 2 * CONTAINER_PADDING,
    height: contentSize.height + 2 * CONTAINER_PADDING + HEADER_HEIGHT,
  };
}

interface NodeLayout {
  /** Own bounding-box size — badge size for leaves, computed size for wrappers. */
  size: { width: number; height: number };
  /**
   * Per-descendant entries produced by this subtree, with positions already
   * expressed relative to the enclosing wrapper's top-left corner (the
   * parent applies its own translate on top when composing the flat map).
   */
  entries: Map<string, NestedLayoutEntry>;
}

/**
 * Bottom-up layout of one hierarchy node. Returns the node's own size and
 * the flat entries produced for its (transitive) children. The caller
 * translates those entries when composing them into a parent scope.
 *
 * Correctness note: recursive children are `await`ed one at a time inside
 * a for-loop (not `Promise.all`) because each expanded child's computed
 * size is what this container's own ELK call needs to route around. A
 * parallel `Promise.all` would fire this container's ELK layout before its
 * inner containers had reported their sizes.
 */
async function layoutNode(
  node: HierarchyNode,
  expandedIds: ReadonlySet<string>,
  edges: readonly AdapterEdge[],
): Promise<NodeLayout> {
  const isWrapper = node.kind === "folder" || node.kind === "file";
  const isExpanded = isWrapper && expandedIds.has(node.id) && node.children.length > 0;

  if (!isExpanded) {
    return {
      size: { width: BADGE_WIDTH, height: BADGE_HEIGHT },
      entries: new Map(),
    };
  }

  // Bottom-up: fully resolve every child (recursively) before this
  // container's own ELK call sees their sizes.
  const childLayouts = new Map<string, NodeLayout>();
  for (const child of node.children) {
    childLayouts.set(child.id, await layoutNode(child, expandedIds, edges));
  }

  const childIds = new Set(node.children.map((c) => c.id));
  const localEdges = edges.filter((e) => childIds.has(e.from) && childIds.has(e.to));

  const adapterNodes: AdapterNode[] = node.children.map((c) => ({ id: c.id, label: c.label }));
  const sizeOf: SizeOf = (id) => childLayouts.get(id)?.size;

  const { positions, contentSize } = await layoutContainer({
    nodes: adapterNodes,
    edges: localEdges,
    sizeOf,
  });

  const entries = new Map<string, NestedLayoutEntry>();
  const offsetX = CONTAINER_PADDING;
  const offsetY = HEADER_HEIGHT + CONTAINER_PADDING;

  for (const child of node.children) {
    const childLayout = childLayouts.get(child.id);
    if (!childLayout) continue;
    const pos = positions.get(child.id) ?? { x: 0, y: 0 };
    const absoluteX = pos.x + offsetX;
    const absoluteY = pos.y + offsetY;
    entries.set(child.id, {
      x: absoluteX,
      y: absoluteY,
      width: childLayout.size.width,
      height: childLayout.size.height,
      parentId: node.id,
    });
    // Propagate the child's own descendants, translated into this
    // wrapper's coordinate space. `parentId` on those inner entries
    // already points at the correct inner container from the recursive
    // call — do NOT overwrite it here.
    for (const [descId, descEntry] of childLayout.entries) {
      entries.set(descId, {
        ...descEntry,
        x: descEntry.x + absoluteX,
        y: descEntry.y + absoluteY,
      });
    }
  }

  return {
    size: wrapperSizeForContent(contentSize),
    entries,
  };
}

/**
 * Reactive nested layout: a `watchEffect` recomputes on `inputKey`
 * changes, guards stale results with a `runId`, and keeps the
 * last-known-good layout on failure. Mirrors `useElkLayout`.
 *
 * Caller-side reactivity note: `expandedIds` is a `Ref<Set<string>>`.
 * A Vue `ref(new Set())` does NOT notify on `Set.add` / `Set.delete` (the
 * value identity stays the same). Callers should either reassign the ref
 * with a fresh Set on every change, or use `reactive(new Set())` cast as
 * `Ref<Set<string>>` — the standard pattern in this codebase.
 */
export function useNestedElkLayout({
  hierarchy,
  expandedIds,
  edges,
}: UseNestedElkLayoutInput): UseNestedElkLayoutResult {
  const layout = ref(new Map<string, NestedLayoutEntry>());
  const pending = ref(false);
  const error = ref<Error | undefined>(undefined);

  const inputKey = computed(() =>
    buildNestedInputKey(hierarchy.value, expandedIds.value, edges.value),
  );

  let lastKey: string | undefined;
  let runId = 0;

  watchEffect(async () => {
    const key = inputKey.value;
    if (key === lastKey) return;
    lastKey = key;

    const myRun = ++runId;
    pending.value = true;
    error.value = undefined;
    try {
      const currentHierarchy = hierarchy.value;
      const currentExpanded = expandedIds.value;
      const currentEdges = edges.value;

      // Lay out every top-level wrapper first — each is a bottom-up
      // recursive call in its own subtree. Awaited sequentially so
      // errors surface deterministically and each subtree's ELK work
      // does not race the next.
      const topLevelLayouts = new Map<string, NodeLayout>();
      for (const entry of currentHierarchy) {
        topLevelLayouts.set(entry.id, await layoutNode(entry, currentExpanded, currentEdges));
      }

      // Top-level positions come from ELK too — one more scoped call over
      // the top-level wrappers themselves, using aggregated cross-top-level
      // edges as ELK's edge input. Layout re-runs on every expand/collapse
      // and can rearrange top-levels to keep related wrappers close and to
      // avoid overlap; the calling page keeps the *focal* node steady on
      // screen by translating the Vue Flow viewport after each pass.
      const topLevelIds = currentHierarchy.map((e) => e.id);
      const topLevelIdSet = new Set(topLevelIds);
      const parentOf = buildParentMap(currentHierarchy);
      const topLevelAgg = aggregateEdges(
        // aggregateEdges accepts the raw `Edge` shape (with a `type`);
        // synthesize the type field since layout only cares about endpoints.
        currentEdges.map((e) => ({ ...e, type: "imports" })),
        parentOf,
        topLevelIdSet,
      );
      const topLevelAdapterEdges: AdapterEdge[] = topLevelAgg.map((e) => ({
        id: e.id,
        from: e.from,
        to: e.to,
      }));
      const topLevelAdapterNodes: AdapterNode[] = currentHierarchy.map((e) => ({
        id: e.id,
        label: e.label,
      }));
      const topLevelSizeOf: SizeOf = (id) => topLevelLayouts.get(id)?.size;
      const { positions: topLevelPositions } = await layoutContainer({
        nodes: topLevelAdapterNodes,
        edges: topLevelAdapterEdges,
        sizeOf: topLevelSizeOf,
      });

      const flat = new Map<string, NestedLayoutEntry>();
      for (const entry of currentHierarchy) {
        const pos = topLevelPositions.get(entry.id);
        const nodeLayout = topLevelLayouts.get(entry.id);
        if (!pos || !nodeLayout) continue;
        // Top-level entries: absolute ELK-derived position, own bottom-up size, no parentId.
        flat.set(entry.id, {
          x: pos.x,
          y: pos.y,
          width: nodeLayout.size.width,
          height: nodeLayout.size.height,
        });
        // Descendant entries: translate the subtree by the top-level position.
        for (const [descId, descEntry] of nodeLayout.entries) {
          flat.set(descId, {
            ...descEntry,
            x: descEntry.x + pos.x,
            y: descEntry.y + pos.y,
          });
        }
      }

      if (myRun !== runId) return;
      layout.value = flat;
    } catch (cause) {
      if (myRun !== runId) return;
      error.value = cause instanceof Error ? cause : new Error(String(cause));
      // Keep last-known-good layout on failure (matches useElkLayout).
    } finally {
      if (myRun === runId) pending.value = false;
    }
  });

  return { layout, pending, error };
}
