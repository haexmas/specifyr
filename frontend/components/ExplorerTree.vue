<script setup lang="ts">
import type { HierarchyNode } from "../composables/build-hierarchy.js";

const props = defineProps<{
  entries: HierarchyNode[];
  highlightedFileId: string | undefined;
  /**
   * Shared mutable expand state — a single `reactive(Set)` created once by
   * the page and passed unchanged through every recursive instance. Mutating
   * it in place (not reassigning) is the intended pattern here: it avoids
   * emit-bubbling a "toggle" event up through every recursion level for
   * what is otherwise page-level shared state.
   */
  expandedIds: Set<string>;
}>();

const emit = defineEmits<{
  select: [nodeId: string | undefined];
}>();

function onFolderClick(entry: HierarchyNode): void {
  if (props.expandedIds.has(entry.id)) props.expandedIds.delete(entry.id);
  else props.expandedIds.add(entry.id);
}

function onFileClick(entry: HierarchyNode): void {
  emit("select", entry.selectable ? entry.id : undefined);
}
</script>

<template>
  <ul class="space-y-0.5 pl-3 first:pl-0">
    <li v-for="entry in entries" :key="entry.id">
      <template v-if="entry.kind === 'folder'">
        <button
          type="button"
          class="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
          :aria-expanded="expandedIds.has(entry.id)"
          @click="onFolderClick(entry)"
        >
          <span class="w-3 shrink-0">{{ expandedIds.has(entry.id) ? "▾" : "▸" }}</span>
          <span class="truncate" :title="entry.label">{{ entry.label }}</span>
        </button>
        <ExplorerTree
          v-if="expandedIds.has(entry.id)"
          :entries="entry.children"
          :highlighted-file-id="highlightedFileId"
          :expanded-ids="expandedIds"
          @select="emit('select', $event)"
        />
      </template>
      <button
        v-else
        type="button"
        class="w-full truncate rounded px-1 py-0.5 pl-4 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
        :class="entry.id === highlightedFileId ? 'bg-primary text-primary-foreground font-semibold' : ''"
        :title="entry.label"
        @click="onFileClick(entry)"
      >
        {{ entry.label }}
      </button>
    </li>
  </ul>
</template>
