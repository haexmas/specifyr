# Contract: `frontend/composables/neighbors.ts` (widened)

Existing exported function widens its return type from 2 lists to 6 lists so the sidebar can render separate sections per edge type.

```ts
export interface Neighbors {
  imports: Node[];         // existing: edge.type === "imports", edge.from === nodeId
  importedBy: Node[];      // existing: edge.type === "imports", edge.to === nodeId

  extends: Node[];         // NEW: edge.type === "extends",    edge.from === nodeId
  extendedBy: Node[];      // NEW: edge.type === "extends",    edge.to === nodeId

  implementsList: Node[];  // NEW: edge.type === "implements", edge.from === nodeId
                           //      (name is `implementsList` because `implements` is a
                           //       reserved word in TS strict-mode contexts)
  implementedBy: Node[];   // NEW: edge.type === "implements", edge.to === nodeId
}

/** Direct (1-hop) neighbors of a node, bucketed by relationship type + direction. */
export function neighborsOf(
  nodeId: string,
  nodes: readonly Node[],
  edges: readonly Edge[],
): Neighbors;
```

## Behavior contract (must hold for all inputs)

- Dangling edges (endpoint id not in `nodes`) are silently skipped in all six buckets.
- Self-loops are silently skipped in all six buckets.
- Each list is deduped by neighbor id.
- Each list is sorted by node `name` ascending (case-sensitive, matching existing behavior).
- Unknown edge types (any value other than `imports` / `extends` / `implements`) contribute to no bucket. Forward-compatibility: future edge types don't crash; they don't render either until the return shape is widened again.
- When `nodeId` is not in `nodes`, all six lists return `[]`.

## Impact on the single call site

`frontend/pages/index.vue`'s `neighborIds` computed currently unions the two existing lists into a `Set<string>` for opacity-dim calculation. It must be extended to union all six lists. No other consumer of `Neighbors` exists.

## Contract non-changes

- Function name, module path, and existing two field names (`imports`, `importedBy`) preserved.
- Order of the returned object's fields is not observable behavior — TypeScript consumers reach fields by name.
- Complexity remains O(nodes + edges).
