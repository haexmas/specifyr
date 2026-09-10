<script setup lang="ts">
import { Handle, type NodeProps, Position } from "@vue-flow/core";
import type { Node } from "specifyr";
import { computed } from "vue";
import { ROLE_CLASSES, nodeRole } from "../../composables/node-role.js";

interface RoleNodeData {
  node: Pick<Node, "type" | "name" | "role">;
  deltaState?: "same" | "add" | "remove" | "change";
  dim?: boolean;
}

const props = defineProps<NodeProps<RoleNodeData>>();

const role = computed(() => nodeRole(props.data.node));
const roleClasses = computed(() => ROLE_CLASSES[role.value]);
</script>

<template>
  <div
    class="min-w-[8.75rem] rounded-md border-2 px-2 py-1.5 text-center text-xs font-medium whitespace-pre-line text-foreground"
    :class="[roleClasses, props.data.dim ? 'opacity-30' : '']"
    :data-role="role"
    :data-delta-state="props.data.deltaState ?? 'same'"
  >
    <Handle type="target" :position="Position.Top" />
    <div>{{ props.data.node.name }}</div>
    <div class="text-[0.65rem] opacity-70">({{ props.data.node.type }})</div>
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>
