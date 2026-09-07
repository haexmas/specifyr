<script setup lang="ts">
import { VueFlow, type Node as FlowNode, type Edge as FlowEdge } from "@vue-flow/core";
import { Background } from "@vue-flow/background";

import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";

interface SollNode {
  id: string;
  type: string;
  name: string;
}

interface SollEdge {
  id: string;
  from: string;
  to: string;
  type: string;
}

interface SollModel {
  meta: { source: string; generatedAt?: string };
  nodes: SollNode[];
  edges: SollEdge[];
}

const { data, error, pending } = await useFetch<SollModel>("/api/soll");

const flowNodes = computed<FlowNode[]>(() => {
  if (!data.value?.nodes) return [];
  return data.value.nodes.map((node, index) => ({
    id: node.id,
    type: "default",
    position: {
      x: (index % 4) * 240,
      y: Math.floor(index / 4) * 160,
    },
    data: { label: `${node.name}\n(${node.type})` },
    class: `soll-node soll-node--${node.type}`,
  }));
});

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
      <span v-if="data?.meta">
        · source: {{ data.meta.source }}
        <span v-if="data.meta.generatedAt">· {{ data.meta.generatedAt }}</span>
      </span>
    </header>
    <div v-if="pending" class="editor-status">Loading…</div>
    <div v-else-if="error" class="editor-status editor-status--error">
      Error: {{ error.message }}
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
