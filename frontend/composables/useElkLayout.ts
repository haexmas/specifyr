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

// One ELK instance per composable invocation — cheap, avoids sharing state
// across concurrent SOLL/IST toggles.
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

  watchEffect(async () => {
    // Read the key so this effect re-fires whenever the input identity changes.
    void inputKey.value;

    pending.value = true;
    error.value = undefined;
    try {
      const graph = modelToElkGraph({ nodes: nodes.value, edges: edges.value });
      // elkjs's ElkNode/ElkExtendedEdge types are structurally compatible with our
      // adapter output, but the generic self-reference in ELK.layout confuses TS.
      // Cast the call site only — our own types stay strict.
      const laidOut = await elk.layout(graph as unknown as Parameters<typeof elk.layout>[0]);
      positions.value = elkResultToPositions(laidOut);
    } catch (cause) {
      error.value = cause instanceof Error ? cause : new Error(String(cause));
      positions.value = new Map();
    } finally {
      pending.value = false;
    }
  });

  return { positions, pending, error };
}
