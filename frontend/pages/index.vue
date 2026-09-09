<script setup lang="ts">
import {
  VueFlow,
  type Node as FlowNode,
  type Edge as FlowEdge,
  MarkerType,
  type NodeMouseEvent,
  useVueFlow,
} from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import type { Model, Node } from "specifyr";
import type { Ref } from "vue";
import {
  buildHierarchy,
  buildParentMap,
  findFilePath,
  type FilePathResult,
  type HierarchyNode,
} from "../composables/build-hierarchy.js";
import { aggregateEdges, visibleAncestors } from "../composables/edge-aggregation.js";
import { formatNodeDetails } from "../composables/format-node-details.js";
import { type Neighbors, neighborsOf } from "../composables/neighbors.js";
import { nodeTypeClasses } from "../composables/node-type-classes.js";
import { matchNodes } from "../composables/search-nodes.js";
import { useNestedElkLayout } from "../composables/useNestedElkLayout.js";
import { useRepoPath } from "../composables/use-repo-path.js";
import type { BrowseResult } from "../server/utils/browse.js";

import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";

type ViewSource = "soll" | "ist";
const view = ref<ViewSource>("soll");
const { repoPath, setRepoPath, isReady } = useRepoPath();

const endpoint = computed(() => {
  const base = view.value === "soll" ? "/api/soll" : "/api/ist";
  return repoPath.value
    ? `${base}?repoPath=${encodeURIComponent(repoPath.value)}`
    : base;
});
const {
  data,
  error,
  status,
  execute: fetchModel,
} = useFetch<Model>(endpoint, {
  // Skip fetching until the composable has hydrated and a repoPath is chosen;
  // the picker shows in place of the data views while inactive. Refetch on
  // view / repoPath / isReady changes is driven by the explicit watch below so
  // useFetch's own `watch` option is intentionally omitted (else it double-fires).
  immediate: false,
});
watch(
  [isReady, repoPath, view],
  () => {
    if (isReady.value && repoPath.value) void fetchModel();
  },
  { immediate: true },
);

const { fitView, getViewport, setViewport } = useVueFlow();

const hierarchy = computed<HierarchyNode[]>(() => buildHierarchy(data.value?.nodes ?? []));
const parentOf = computed<Map<string, string | undefined>>(() =>
  buildParentMap(hierarchy.value),
);
const expandedFolderIds = reactive(new Set<string>());
const expandedCanvasIds = reactive(new Set<string>());
watch([repoPath, view], () => {
  expandedFolderIds.clear();
  expandedCanvasIds.clear();
});

const layoutEdges = computed(() =>
  data.value?.edges?.map((e) => ({ id: e.id, from: e.from, to: e.to })) ?? [],
);

const { layout, pending: layoutPending } = useNestedElkLayout({
  hierarchy,
  expandedIds: computed(() => expandedCanvasIds) as Ref<Set<string>>,
  edges: layoutEdges,
});

const selectedNodeId = ref<string | undefined>(undefined);

const selectedNode = computed(() => {
  if (!selectedNodeId.value || !data.value?.nodes) return undefined;
  return data.value.nodes.find((n) => n.id === selectedNodeId.value);
});

const selectedNodeDetails = computed(() =>
  selectedNode.value ? formatNodeDetails(selectedNode.value) : [],
);

const neighbors = computed<Neighbors>(() => {
  if (!selectedNode.value || !data.value) return { imports: [], importedBy: [] };
  return neighborsOf(selectedNode.value.id, data.value.nodes, data.value.edges);
});

const neighborIds = computed<Set<string>>(() => {
  const s = new Set<string>();
  for (const n of neighbors.value.imports) s.add(n.id);
  for (const n of neighbors.value.importedBy) s.add(n.id);
  if (selectedNode.value) s.add(selectedNode.value.id);
  return s;
});

const searchQuery = ref("");

const matches = computed<Node[]>(() =>
  matchNodes(searchQuery.value, data.value?.nodes ?? []),
);

const matchIds = computed<Set<string>>(
  () => new Set(matches.value.map((n) => n.id)),
);

function onNodeClick({ node }: NodeMouseEvent): void {
  if (node.data?.kind === "folder" || node.data?.kind === "file") {
    // Snapshot the wrapper's on-screen position BEFORE toggling — the
    // layout pass that follows re-runs ELK at the top level too and can
    // shift every wrapper. The post-layout watcher then translates the
    // Vue Flow viewport so this specific node ends up at (approximately)
    // the same screen coordinates, keeping the eye anchored on what the
    // user just clicked while everything else is free to re-flow.
    const el = document.querySelector(
      `.vue-flow__node[data-id="${CSS.escape(node.id)}"]`,
    ) as HTMLElement | null;
    if (el) {
      const rect = el.getBoundingClientRect();
      stayAtScreenPos.value = { nodeId: node.id, screenX: rect.left, screenY: rect.top };
    }
    if (expandedCanvasIds.has(node.id)) expandedCanvasIds.delete(node.id);
    else expandedCanvasIds.add(node.id);
    // A real-module file wrapper is also a selectable node; keep that
    // dual behavior — toggle expansion AND set selectedNodeId when the
    // wrapper is selectable.
    if (node.selectable) selectedNodeId.value = node.id;
    return;
  }
  selectedNodeId.value = node.id;
}

interface StayAtScreenPos {
  nodeId: string;
  screenX: number;
  screenY: number;
}
const stayAtScreenPos = ref<StayAtScreenPos | undefined>(undefined);

function onPaneClick(): void {
  selectedNodeId.value = undefined;
}

function onSearchSubmit(): void {
  const first = matches.value[0];
  if (!first) return;
  selectedNodeId.value = first.id;
  void fitView({ nodes: [first.id], duration: 400, padding: 0.3 });
}

const selectionFilePath = computed<FilePathResult | undefined>(() => {
  if (!selectedNodeId.value) return undefined;
  return findFilePath(hierarchy.value, selectedNodeId.value);
});
watch(selectionFilePath, (result) => {
  if (!result) return;
  for (const folderId of result.folderIds) {
    expandedFolderIds.add(folderId);
    expandedCanvasIds.add(folderId);
  }
  // Note: the file itself stays collapsed on the canvas per design doc.
  // Clicking the wrapper on the canvas is what opens the file's contents.
});

function onExplorerSelect(nodeId: string | undefined): void {
  selectedNodeId.value = nodeId;
  const fitId = nodeId
    ? (findFilePath(hierarchy.value, nodeId)?.fileId ?? nodeId)
    : undefined;
  pendingFitId.value = fitId;
}

const pendingFitId = ref<string | undefined>(undefined);

/**
 * Emits three flavours of Vue Flow node from the nested `layout` map:
 * 1. Wrapper nodes for every folder/file entry present in the layout.
 * 2. Symbol leaf nodes for every symbol entry present in the layout.
 * 3. Symbols whose parent wrapper is collapsed are absent from the layout
 *    map, so they simply do not render.
 *
 * The array is emitted in hierarchy pre-order (parent before children) so
 * Vue Flow can resolve every `parentNode` reference — a violation triggers
 * Vue Flow's "parent node ... not found" console warning.
 */
const flowNodes = computed<FlowNode[]>(() => {
  const layoutMap = layout.value;
  if (!hierarchy.value.length || layoutMap.size === 0) return [];
  const selectedId = selectedNode.value?.id;
  const hasSelection = Boolean(selectedId);
  const hasSearch = searchQuery.value.trim().length > 0;

  const results: FlowNode[] = [];

  function walk(entries: readonly HierarchyNode[]): void {
    for (const entry of entries) {
      const entryLayout = layoutMap.get(entry.id);
      if (!entryLayout) continue;
      const parentLayout = entryLayout.parentId
        ? layoutMap.get(entryLayout.parentId)
        : undefined;
      const position = parentLayout
        ? { x: entryLayout.x - parentLayout.x, y: entryLayout.y - parentLayout.y }
        : { x: entryLayout.x, y: entryLayout.y };
      if (entry.kind === "folder" || entry.kind === "file") {
        const expanded = expandedCanvasIds.has(entry.id) && entry.children.length > 0;
        // Intermediate variable (inferred literal type) preserves the
        // pass-through of Vue Flow's runtime-only `selected` field without
        // tripping TypeScript's excess-property check on object literals.
        const wrapperNode = {
          id: entry.id,
          type: "default",
          position,
          data: { label: entry.label, kind: entry.kind, expanded },
          style: {
            width: `${entryLayout.width}px`,
            height: `${entryLayout.height}px`,
          },
          class: `wrapper-node ${expanded ? "wrapper-expanded" : "wrapper-collapsed"}`,
          selectable: entry.selectable,
          parentNode: entryLayout.parentId ?? undefined,
          extent: entryLayout.parentId ? ("parent" as const) : undefined,
          selected: entry.id === selectedId,
        };
        results.push(wrapperNode);
        walk(entry.children);
      } else {
        // symbol leaf — only reachable when its wrapper chain is expanded
        // (otherwise the composable does not include it in the layout map).
        const node = entry.node;
        if (!node) continue;
        const dimBySelection = hasSelection && !neighborIds.value.has(node.id);
        const dimBySearch = hasSearch && !matchIds.value.has(node.id);
        const dim = dimBySelection || dimBySearch;
        const classes = ["soll-node", nodeTypeClasses(node.type)];
        if (dim) classes.push("opacity-30");
        const symbolNode = {
          id: node.id,
          type: "default",
          position,
          data: { label: `${node.name}\n(${node.type})` },
          class: classes.join(" "),
          selected: node.id === selectedId,
          parentNode: entryLayout.parentId ?? undefined,
          extent: entryLayout.parentId ? ("parent" as const) : undefined,
        };
        results.push(symbolNode);
      }
    }
  }

  walk(hierarchy.value);
  return results;
});

watch(
  [layoutPending, flowNodes, pendingFitId],
  ([pending]) => {
    const fitId = pendingFitId.value;
    if (pending || !fitId || !flowNodes.value.some((node) => node.id === fitId)) return;
    pendingFitId.value = undefined;
    void fitView({ nodes: [fitId], duration: 400, padding: 0.3 });
  },
  { flush: "post" },
);

/**
 * Focal-node-stays-put: after a wrapper click triggers a layout pass, wait
 * for the new positions to hit the DOM (post flush + `nextTick`), read the
 * clicked wrapper's new on-screen rect, and translate the Vue Flow viewport
 * by the delta so the wrapper appears to stay put while everything else
 * re-flows around it. Skipped when the delta is <1px (layout didn't move
 * the node) or when the node vanished from the render (defensive).
 */
watch(
  [layoutPending, flowNodes, stayAtScreenPos],
  ([pending]) => {
    const target = stayAtScreenPos.value;
    if (pending || !target) return;
    if (!flowNodes.value.some((node) => node.id === target.nodeId)) {
      stayAtScreenPos.value = undefined;
      return;
    }
    void nextTick(() => {
      const el = document.querySelector(
        `.vue-flow__node[data-id="${CSS.escape(target.nodeId)}"]`,
      ) as HTMLElement | null;
      stayAtScreenPos.value = undefined;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = rect.left - target.screenX;
      const dy = rect.top - target.screenY;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      const vp = getViewport();
      void setViewport(
        { x: vp.x - dx, y: vp.y - dy, zoom: vp.zoom },
        { duration: 200 },
      );
    });
  },
  { flush: "post" },
);

/** Transforms SOLL edges into Vue Flow edge objects. */
const flowEdges = computed<FlowEdge[]>(() => {
  if (!data.value?.edges) return [];
  const selectedId = selectedNode.value?.id;
  const visibleIds = new Set(flowNodes.value.map((n) => n.id));
  // Selection-adjacency for aggregated edges: an edge is "adjacent to"
  // the selection when its endpoint sits *anywhere* on the selection's
  // visible ancestor chain — that catches both intra-wrapper edges
  // (raw endpoints preserved, chain contains the selection itself) and
  // cross-wrapper aggregates (endpoints are wrapper ids the selection
  // is nested inside). Checking only the immediate parent misses every
  // aggregate that lives further up the chain, dimming edges that in
  // fact carry the selection's own imports.
  const selectionChain = selectedId
    ? visibleAncestors(selectedId, parentOf.value, visibleIds)
    : new Set<string>();
  const aggregated = aggregateEdges(data.value.edges, parentOf.value, visibleIds);
  return aggregated.map((edge) => {
    // `AggregatedEdge` carries no `type` field on purpose: an aggregate can
    // collapse edges of mixed kinds and there's no single right answer.
    // The pre-aggregation code short-circuited `dim` to false for every
    // `imports` edge — since `imports` is the only shipped edge type today,
    // no edge was ever dimmed under selection. Dropping that guard means
    // every non-adjacent aggregate now dims like the symbol nodes do; the
    // canvas reads more consistently under selection. When mixed edge
    // types land, extend `AggregatedEdge` with a discriminator (likely
    // `types: Set<string>`) before restoring per-type dim behavior.
    const dim =
      Boolean(selectedId) &&
      !selectionChain.has(edge.from) &&
      !selectionChain.has(edge.to);
    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      type: "smoothstep",
      animated: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "var(--graph-arrow)",
        width: 16,
        height: 16,
      },
      style: { stroke: "var(--graph-arrow)", strokeWidth: 1.5 },
      class: dim ? "opacity-20" : "",
    };
  });
});

// -- Picker modal -----------------------------------------------------------

const pickerOpen = ref(false);
const browsePath = ref<string | undefined>(undefined);

const showPicker = computed(() => isReady.value && (!repoPath.value || pickerOpen.value));

const browseEndpoint = computed(() =>
  browsePath.value
    ? `/api/browse?path=${encodeURIComponent(browsePath.value)}`
    : "/api/browse",
);
const {
  data: browseData,
  error: browseError,
  execute: fetchBrowse,
} = useFetch<BrowseResult>(browseEndpoint, {
  // Driven by the explicit watches below (visibility + browsePath) so the
  // fetch fires once per user action instead of racing with useFetch's own
  // internal watcher on `browseEndpoint`.
  immediate: false,
});
const pickerDialog = ref<HTMLElement | null>(null);
// Fetch once whenever the picker becomes visible or its browse path changes.
watch(
  [showPicker, browsePath],
  ([visible]) => {
    if (visible) void fetchBrowse();
  },
  { immediate: true },
);
watch(
  showPicker,
  (visible) => {
    if (visible) void nextTick(() => pickerDialog.value?.focus());
  },
  { immediate: true },
);

onMounted(() => {
  watch(
    showPicker,
    (visible) => {
      if (visible) document.addEventListener("keydown", onPickerEsc);
      else document.removeEventListener("keydown", onPickerEsc);
    },
    { immediate: true },
  );
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onPickerEsc);
});

function joinPath(parent: string, name: string): string {
  return parent.endsWith("/") ? `${parent}${name}` : `${parent}/${name}`;
}

function drillDown(name: string): void {
  const current = browseData.value?.path;
  if (!current) return;
  browsePath.value = joinPath(current, name);
}

function goUp(): void {
  const parent = browseData.value?.parent;
  if (!parent) return;
  browsePath.value = parent;
}

function goHome(): void {
  const home = browseData.value?.home;
  if (!home) return;
  browsePath.value = home;
}

function openPicker(): void {
  browsePath.value = browseData.value?.home ?? undefined;
  pickerOpen.value = true;
}

function selectCurrent(): void {
  const current = browseData.value?.path;
  if (!current) return;
  setRepoPath(current);
  pickerOpen.value = false;
}

function cancelPicker(): void {
  if (!repoPath.value) return; // nothing to cancel to on cold start
  pickerOpen.value = false;
}

function onPickerEsc(event?: KeyboardEvent): void {
  if (event?.key && event.key !== "Escape") return;
  cancelPicker();
}

/** Middle-truncate a path so both ends stay visible in the header badge. */
function shortenPath(value: string, max = 48): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}
</script>

<template>
  <div class="flex h-screen flex-col font-sans">
    <header
      class="flex flex-wrap items-center gap-2 border-b border-zinc-300 bg-zinc-100 px-4 py-2 text-sm"
    >
      <strong>specifyr editor</strong>
      <div
        class="inline-flex overflow-hidden rounded-md border border-zinc-300"
        role="group"
        aria-label="View source"
      >
        <button
          type="button"
          class="cursor-pointer border-r border-zinc-300 bg-transparent px-3 py-1 last:border-r-0"
          style="font: inherit"
          :class="view === 'soll' ? 'bg-zinc-200 font-semibold' : ''"
          @click="view = 'soll'"
        >
          SOLL
        </button>
        <button
          type="button"
          class="cursor-pointer border-r border-zinc-300 bg-transparent px-3 py-1 last:border-r-0"
          style="font: inherit"
          :class="view === 'ist' ? 'bg-zinc-200 font-semibold' : ''"
          @click="view = 'ist'"
        >
          IST
        </button>
      </div>
      <form
        class="flex w-full min-w-0 items-center sm:w-auto"
        role="search"
        @submit.prevent="onSearchSubmit"
      >
        <label class="sr-only" for="node-search">Search nodes</label>
        <input
          id="node-search"
          v-model="searchQuery"
          type="search"
          placeholder="Search nodes…"
          class="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none sm:w-64 sm:flex-none"
        />
        <span
          v-if="searchQuery.trim()"
          class="ml-2 text-xs text-zinc-500"
          aria-live="polite"
        >
          {{ matches.length }} match{{ matches.length === 1 ? "" : "es" }}
        </span>
      </form>
      <span v-if="repoPath" class="flex min-w-0 items-center gap-1 text-zinc-600">
        <span
          class="max-w-[24rem] truncate rounded bg-zinc-200 px-2 py-0.5 font-mono text-xs"
          :title="repoPath"
        >
          {{ shortenPath(repoPath) }}
        </span>
        <button
          type="button"
          class="cursor-pointer rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs hover:bg-zinc-50"
          style="font: inherit"
          @click="openPicker"
        >
          Change…
        </button>
      </span>
      <span v-if="data?.meta" class="min-w-0 break-words text-zinc-600">
        · source: {{ data.meta.source }}
        <span v-if="data.meta.generatedAt">· {{ data.meta.generatedAt }}</span>
      </span>
      <span v-if="layoutPending" class="italic text-zinc-500">· laying out…</span>
    </header>

    <div
      v-if="!isReady"
      class="flex flex-1 items-center justify-center text-zinc-500"
    >
      Loading…
    </div>
    <div
      v-else-if="!repoPath"
      class="flex flex-1 items-center justify-center text-zinc-500"
    >
      Select a repository to get started.
    </div>
    <div
      v-else-if="status === 'pending'"
      class="flex flex-1 items-center justify-center text-zinc-500"
    >
      Loading…
    </div>
    <div
      v-else-if="error"
      class="flex flex-1 items-center justify-center whitespace-pre-wrap text-red-600"
    >
      Error: {{ (error.data as { error?: string })?.error ?? error.message }}
    </div>
    <div
      v-else-if="!data?.nodes?.length"
      class="flex flex-1 items-center justify-center text-zinc-500"
    >
      {{ view.toUpperCase() }} is empty — no nodes to display.
    </div>
    <div v-else class="flex min-h-0 flex-1">
      <aside
        class="w-72 shrink-0 overflow-y-auto border-r border-zinc-300 bg-zinc-50 px-3 py-3 text-sm"
        aria-label="Explorer"
      >
        <h2 class="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Explorer</h2>
        <ExplorerTree
          :entries="hierarchy"
          :highlighted-file-id="selectionFilePath?.fileId"
          :expanded-ids="expandedFolderIds"
          @select="onExplorerSelect"
        />
      </aside>
      <div class="min-h-0 flex-1" style="background: var(--graph-bg)">
        <VueFlow
          :nodes="flowNodes"
          :edges="flowEdges"
          :nodes-draggable="false"
          :nodes-connectable="false"
          :elements-selectable="true"
          @node-click="onNodeClick"
          @pane-click="onPaneClick"
        >
          <Background pattern-color="var(--graph-grid)" />
        </VueFlow>
      </div>
      <aside
        class="w-80 shrink-0 overflow-y-auto border-l border-zinc-300 bg-zinc-50 px-4 py-3 text-sm"
        aria-label="Node details"
      >
        <div v-if="!selectedNode" class="text-zinc-500">Nothing selected.</div>
        <dl
          v-else
          class="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1"
        >
          <template v-for="row in selectedNodeDetails" :key="row.label">
            <dt class="font-medium text-zinc-500">{{ row.label }}</dt>
            <dd class="min-w-0 break-words font-mono text-xs text-zinc-800">
              {{ row.value }}
            </dd>
          </template>
        </dl>
        <section v-if="selectedNode" class="mt-4">
          <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Imports ({{ neighbors.imports.length }})
          </h3>
          <ul v-if="neighbors.imports.length" class="space-y-0.5">
            <li v-for="n in neighbors.imports" :key="n.id">
              <button
                type="button"
                class="w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-xs text-zinc-800 hover:bg-zinc-200"
                :title="n.name"
                @click="selectedNodeId = n.id"
              >{{ n.name }}</button>
            </li>
          </ul>
          <p v-else class="text-xs text-zinc-500">None</p>
        </section>
        <section v-if="selectedNode" class="mt-4">
          <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Imported by ({{ neighbors.importedBy.length }})
          </h3>
          <ul v-if="neighbors.importedBy.length" class="space-y-0.5">
            <li v-for="n in neighbors.importedBy" :key="n.id">
              <button
                type="button"
                class="w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-xs text-zinc-800 hover:bg-zinc-200"
                :title="n.name"
                @click="selectedNodeId = n.id"
              >{{ n.name }}</button>
            </li>
          </ul>
          <p v-else class="text-xs text-zinc-500">None</p>
        </section>
      </aside>
    </div>

    <div
      v-if="showPicker"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="repo-picker-title"
      ref="pickerDialog"
      tabindex="-1"
      @keydown.esc="onPickerEsc"
    >
      <div class="w-[560px] max-w-full rounded-lg bg-white p-4 shadow-xl">
        <div class="mb-3 flex items-center gap-2">
          <h2
            id="repo-picker-title"
            class="mr-auto text-sm font-semibold text-zinc-700"
          >
            Select a repository
          </h2>
          <button
            type="button"
            class="cursor-pointer rounded border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            style="font: inherit"
            :disabled="!browseData?.parent"
            aria-label="Go to parent directory"
            @click="goUp"
          >
            ↑ Up
          </button>
          <button
            type="button"
            class="cursor-pointer rounded border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-50"
            style="font: inherit"
            @click="goHome"
          >
            ⌂ Home
          </button>
        </div>
        <div
          class="mb-2 truncate rounded bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-700"
          :title="browseData?.path ?? ''"
        >
          {{ browseData?.path ?? "Loading…" }}
        </div>
        <div
          class="mb-3 max-h-[50vh] min-h-[8rem] overflow-y-auto rounded border border-zinc-200"
        >
          <p v-if="browseError" class="p-3 text-xs text-red-600">
            Error:
            {{ (browseError.data as { error?: string })?.error ?? browseError.message }}
          </p>
          <p
            v-else-if="!browseData"
            class="p-3 text-xs text-zinc-500"
          >
            Loading…
          </p>
          <p
            v-else-if="browseData.entries.length === 0"
            class="p-3 text-xs text-zinc-500"
          >
            No subdirectories.
          </p>
          <ul v-else class="divide-y divide-zinc-100">
            <li v-for="entry in browseData.entries" :key="entry.name">
              <button
                type="button"
                class="w-full cursor-pointer px-3 py-1.5 text-left font-mono text-xs text-zinc-800 hover:bg-zinc-100"
                style="font: inherit"
                @click="drillDown(entry.name)"
              >
                {{ entry.name }}/
              </button>
            </li>
          </ul>
        </div>
        <div class="flex items-center justify-end gap-2">
          <button
            v-if="repoPath"
            type="button"
            class="cursor-pointer rounded border border-zinc-300 bg-white px-3 py-1 text-xs hover:bg-zinc-50"
            style="font: inherit"
            @click="cancelPicker"
          >
            Cancel
          </button>
          <button
            type="button"
            class="cursor-pointer rounded bg-zinc-800 px-3 py-1 text-xs font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
            style="font: inherit"
            :disabled="!browseData?.path"
            @click="selectCurrent"
          >
            Select this folder
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Vue Flow injects .vue-flow__node-default into a DOM subtree that our scoped
   styles can't reach. Keep this small — only what Vue Flow's default theme
   overrides on our node element. Per-type colors come from the element's
   class attribute (via nodeTypeClasses). */
.soll-node.vue-flow__node-default {
  border-radius: 0.5rem;
  border-width: 1px;
  padding: 0.5rem;
  text-align: center;
  font-size: 0.75rem;
  white-space: pre-line;
  min-width: 140px;
}
.wrapper-node.vue-flow__node-default {
  border-radius: 0.5rem;
  border-width: 1px;
  border-color: var(--graph-arrow);
  background: color-mix(in oklab, var(--graph-mask), transparent 30%);
  padding: 0;
  text-align: left;
}
.wrapper-node.wrapper-collapsed.vue-flow__node-default {
  min-width: 160px;
  padding: 0.5rem;
  text-align: center;
  font-size: 0.75rem;
}
</style>
