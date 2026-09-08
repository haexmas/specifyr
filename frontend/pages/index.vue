<script setup lang="ts">
import {
  VueFlow,
  type Node as FlowNode,
  type Edge as FlowEdge,
  type NodeMouseEvent,
  useVueFlow,
} from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import type { Model, Node } from "specifyr";
import { formatNodeDetails } from "../composables/format-node-details.js";
import { type Neighbors, neighborsOf } from "../composables/neighbors.js";
import { nodeTypeClasses } from "../composables/node-type-classes.js";
import { matchNodes } from "../composables/search-nodes.js";

import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";

type ViewSource = "soll" | "ist";
const view = ref<ViewSource>("soll");
const endpoint = computed(() => (view.value === "soll" ? "/api/soll" : "/api/ist"));
const { data, error, status } = useFetch<Model>(endpoint, { watch: [view] });

const { fitView } = useVueFlow();

const layoutInput = computed(() => ({
  nodes: data.value?.nodes?.map((n) => ({ id: n.id, label: n.name })) ?? [],
  edges: data.value?.edges?.map((e) => ({ id: e.id, from: e.from, to: e.to })) ?? [],
}));
const { positions, pending: layoutPending } = useElkLayout({
  nodes: computed(() => layoutInput.value.nodes),
  edges: computed(() => layoutInput.value.edges),
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
  selectedNodeId.value = node.id;
}

function onPaneClick(): void {
  selectedNodeId.value = undefined;
}

function onSearchSubmit(): void {
  const first = matches.value[0];
  if (!first) return;
  selectedNodeId.value = first.id;
  void fitView({ nodes: [first.id], duration: 400, padding: 0.3 });
}

/** Transforms SOLL nodes into Vue Flow node objects with layout positions. */
const flowNodes = computed<FlowNode[]>(() => {
  if (!data.value?.nodes) return [];
  const selectedId = selectedNode.value?.id;
  const hasSelection = Boolean(selectedId);
  const hasSearch = searchQuery.value.trim().length > 0;
  return data.value.nodes.map((node) => {
    const dimBySelection = hasSelection && !neighborIds.value.has(node.id);
    const dimBySearch = hasSearch && !matchIds.value.has(node.id);
    const dim = dimBySelection || dimBySearch;
    const classes = ["soll-node", nodeTypeClasses(node.type)];
    if (dim) classes.push("opacity-30");
    return {
      id: node.id,
      type: "default",
      position: positions.value.get(node.id) ?? { x: 0, y: 0 },
      data: { label: `${node.name}\n(${node.type})` },
      class: classes.join(" "),
      selected: node.id === selectedId,
    };
  });
});

/** Transforms SOLL edges into Vue Flow edge objects. */
const flowEdges = computed<FlowEdge[]>(() => {
  if (!data.value?.edges) return [];
  const selectedId = selectedNode.value?.id;
  return data.value.edges.map((edge) => {
    const dim =
      Boolean(selectedId) &&
      edge.type !== "imports" &&
      edge.from !== selectedId &&
      edge.to !== selectedId;
    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: edge.type,
      animated: false,
      class: dim ? "opacity-20" : "",
    };
  });
});
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
      <span v-if="data?.meta" class="min-w-0 break-words text-zinc-600">
        · source: {{ data.meta.source }}
        <span v-if="data.meta.generatedAt">· {{ data.meta.generatedAt }}</span>
      </span>
      <span v-if="layoutPending" class="italic text-zinc-500">· laying out…</span>
    </header>

    <div
      v-if="status === 'pending'"
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
      <div class="min-h-0 flex-1">
        <VueFlow
          :nodes="flowNodes"
          :edges="flowEdges"
          :nodes-draggable="false"
          :nodes-connectable="false"
          :elements-selectable="true"
          @node-click="onNodeClick"
          @pane-click="onPaneClick"
        >
          <Background />
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
</style>
