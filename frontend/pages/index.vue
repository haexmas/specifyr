<script setup lang="ts">
import { VueFlow, type Node as FlowNode, type Edge as FlowEdge } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import type { Model } from "specifyr";

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
    class: `soll-node soll-node--${node.type}`,
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
  <div class="editor-shell">
    <header class="editor-topbar">
      <strong>specifyr editor</strong>
      <div class="editor-segmenter" role="group" aria-label="View source">
        <button
          type="button"
          :class="{ 'is-active': view === 'soll' }"
          @click="view = 'soll'"
        >
          SOLL
        </button>
        <button
          type="button"
          :class="{ 'is-active': view === 'ist' }"
          @click="view = 'ist'"
        >
          IST
        </button>
      </div>
      <span v-if="data?.meta">
        · source: {{ data.meta.source }}
        <span v-if="data.meta.generatedAt">· {{ data.meta.generatedAt }}</span>
      </span>
      <span v-if="layoutPending" class="editor-layout-status">· laying out…</span>
    </header>
    <div v-if="status === 'pending'" class="editor-status">Loading…</div>
    <div v-else-if="error" class="editor-status editor-status--error">
      Error: {{ (error.data as { error?: string })?.error ?? error.message }}
    </div>
    <div v-else-if="!data?.nodes?.length" class="editor-status">
      {{ view.toUpperCase() }} is empty — no nodes to display.
    </div>
    <div v-else class="editor-canvas">
      <VueFlow :nodes="flowNodes" :edges="flowEdges" :nodes-draggable="false" :nodes-connectable="false" :elements-selectable="false">
        <Background />
      </VueFlow>
    </div>
  </div>
</template>

<style scoped>
.editor-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: system-ui, -apple-system, sans-serif;
}
.editor-topbar {
  padding: 0.5rem 1rem;
  background: #f4f4f5;
  border-bottom: 1px solid #d4d4d8;
  font-size: 0.9rem;
}
.editor-status {
  flex: 1;
  display: grid;
  place-items: center;
  color: #71717a;
}
.editor-status--error {
  color: #dc2626;
  white-space: pre-wrap;
}
.editor-canvas {
  flex: 1;
  min-height: 0;
}
.editor-segmenter {
  display: inline-flex;
  margin: 0 0.5rem;
  border: 1px solid #d4d4d8;
  border-radius: 6px;
  overflow: hidden;
}
.editor-segmenter button {
  padding: 0.25rem 0.75rem;
  background: transparent;
  border: none;
  border-right: 1px solid #d4d4d8;
  font: inherit;
  cursor: pointer;
}
.editor-segmenter button:last-child {
  border-right: none;
}
.editor-segmenter button.is-active {
  background: #e4e4e7;
  font-weight: 600;
}
.editor-layout-status {
  color: #6b7280;
  font-style: italic;
}
</style>

<style>
.soll-node.vue-flow__node-default {
  border-radius: 8px;
  border: 1px solid #a1a1aa;
  padding: 8px 12px;
  font-size: 12px;
  white-space: pre-line;
  text-align: center;
  min-width: 140px;
}
.soll-node--component.vue-flow__node-default { background: #dbeafe; border-color: #3b82f6; }
.soll-node--module.vue-flow__node-default { background: #dcfce7; border-color: #22c55e; }
.soll-node--external-service.vue-flow__node-default { background: #fef3c7; border-color: #f59e0b; }
.soll-node--data-store.vue-flow__node-default { background: #fce7f3; border-color: #ec4899; }
</style>
