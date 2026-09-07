import ELK from "elkjs/lib/elk.bundled.js";
import { type Ref, computed, ref, watchEffect } from "vue";

import {
  type AdapterEdge,
  type AdapterNode,
  elkResultToPositions,
  modelToElkGraph,
} from "./elk-adapter.js";

export interface UseElkLayoutInput {
  nodes: Ref<AdapterNode[]>;
  edges: Ref<AdapterEdge[]>;
}

export interface UseElkLayoutResult {
  positions: Ref<Map<string, { x: number; y: number }>>;
  pending: Ref<boolean>;
  error: Ref<Error | undefined>;
}

// One ELK instance per composable invocation. elk.bundled.js resolves to an
// in-thread FakeWorker (no OS Web Worker), so there is nothing to terminate
// on unmount — GC releases the closure when the composable's refs are dropped.
export function useElkLayout({ nodes, edges }: UseElkLayoutInput): UseElkLayoutResult {
  const positions = ref(new Map<string, { x: number; y: number }>());
  const pending = ref(false);
  const error = ref<Error | undefined>(undefined);
  const elk = new ELK();

  const inputKey = computed(() =>
    JSON.stringify({
      n: nodes.value.map((n) => n.id).sort(),
      e: edges.value.map((e) => `${e.from}->${e.to}`).sort(),
    }),
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
      const graph = modelToElkGraph({ nodes: nodes.value, edges: edges.value });
      // elkjs's ElkNode/ElkExtendedEdge types are structurally compatible with our
      // adapter output, but the generic self-reference in ELK.layout confuses TS.
      // Cast the call site only — our own types stay strict.
      const laidOut = await elk.layout(graph as unknown as Parameters<typeof elk.layout>[0]);
      if (myRun !== runId) return; // a newer run has started, discard stale result
      positions.value = elkResultToPositions(laidOut);
    } catch (cause) {
      if (myRun !== runId) return; // discard stale error too
      error.value = cause instanceof Error ? cause : new Error(String(cause));
      // Note: keeps the last-known-good positions instead of clearing them.
      // Graceful ELK-failure UI is a non-goal; this at least avoids a blank canvas.
    } finally {
      if (myRun === runId) pending.value = false;
    }
  });

  return { positions, pending, error };
}
