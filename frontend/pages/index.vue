<script setup lang="ts">
import { VueFlow, type Node as FlowNode, type Edge as FlowEdge } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import type { Model } from "specifyr";
import { nodeTypeClasses } from "../composables/node-type-classes.js";

import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";

type ViewSource = "soll" | "ist";
const view = ref<ViewSource>("soll");
const endpoint = computed(() => (view.value === "soll" ? "/api/soll" : "/api/ist"));
const { data, error, status } = useFetch<Model>(endpoint, { watch: [view] });

const layoutInput = computed(() => ({
  nodes: data.value?.nodes?.map((n) => ({ id: n.id, label: n.name })) ?? [],
  edges: data.value?.edges?.map((e) => ({ id: e.id, from: e.from, to: e.to })) ?? [],
}));
const { positions, pending: layoutPending } = useElkLayout({
  nodes: computed(() => layoutInput.value.nodes),
  edges: computed(() => layoutInput.value.edges),
});

/** Transforms SOLL nodes into Vue Flow node objects with layout positions. */
const flowNodes = computed<FlowNode[]>(() => {
  if (!data.value?.nodes) return [];
  return data.value.nodes.map((node) => ({
    id: node.id,
    type: "default",
    position: positions.value.get(node.id) ?? { x: 0, y: 0 },
    data: { label: `${node.name}\n(${node.type})` },
    class: `soll-node ${nodeTypeClasses(node.type)}`,
  }));
});

/** Transforms SOLL edges into Vue Flow edge objects. */
const flowEdges = computed<FlowEdge[]>(() => {
  if (!data.value?.edges) return [];
  return data.value.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: edge.type,
    animated: false,
  }));
});
</script>

<template>
  <div class="flex h-screen flex-col font-sans">
    <header class="flex items-center gap-2 border-b border-zinc-300 bg-zinc-100 px-4 py-2 text-sm">
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
      <span v-if="data?.meta" class="text-zinc-600">
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
    <div v-else class="min-h-0 flex-1">
      <VueFlow
        :nodes="flowNodes"
        :edges="flowEdges"
        :nodes-draggable="false"
        :nodes-connectable="false"
        :elements-selectable="false"
      >
        <Background />
      </VueFlow>
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
