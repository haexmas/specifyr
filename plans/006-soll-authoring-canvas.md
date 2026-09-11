# Plan 006: SOLL-Authoring — freies Platzieren, Zeichnen, Persistieren

> **Für Claude:** Dieser Plan wird task-für-task ausgeführt. Bevorzugte Sub-Skill:
> `superpowers:executing-plans` bzw. `superpowers:subagent-driven-development`.

- Status: DRAFT — abgestimmter Umsetzungsvorschlag, noch nicht implementiert.
- Priorität: P1; Aufwand: L (7 Schnitte); Risiko: MED (neuer Write-Pfad in
  Storage, viele UI-Interaktionen; kein Datenmodell-Bruch — `layout` ist
  optionale Erweiterung).
- Geplant gegen specifyr `HEAD` von Branch `ts/slice-hierarchy-data`, 2026-09-09.
- Anschluss an: [Plan 001](001-editor-perspectives-and-state-comparison.md)
  „SOLL bearbeiten" und [Plan 005](005-visual-language-and-diff-views.md)
  „visuelle Sprache". Dieser Plan liefert erstmals **Schreib-Fähigkeit** auf
  `.specifyr/soll/` aus dem Editor heraus.
- Ausgangspunkt: `/home/haex/Projekte/specifyr`.
- Bewusste Wahl: Wir bleiben im Vue-Flow-Stack (keine Fremd-Libs wie tldraw
  oder Excalidraw). Freie Positionierung, Resize und Handle-Drag-Edges sind
  Vue-Flow-nativ; das hält den Editor konsistent mit IST/PLAN.

## Ziel und Erfolgskriterium

Im SOLL-View kann der Nutzer:

1. Neue Knoten per Drag&Drop aus einer Palette auf die Fläche legen.
2. Knoten frei verschieben und in ihrer Größe verändern.
3. Kanten per Handle-Drag zwischen zwei Knoten ziehen.
4. Ausgewählte Knoten/Kanten via `Delete`/`Backspace` löschen.
5. Alle Änderungen (Position, Größe, Nodes, Edges) werden **debounced** in
   `.specifyr/soll/` persistiert und überleben einen Neuladen des Editors.

**Erfolg**, wenn folgendes ohne Handkorrektur funktioniert:

- `pnpm specifyr editor <fresh-repo>` öffnet den Editor. SOLL-View zeigt
  „empty" plus eine Palette. Ein neuer `component`-Node wird per Drag auf die
  Fläche gelegt, mit dem Standardnamen versehen und liegt an der Drop-Position.
- Nach 500 ms erscheint `.specifyr/soll/components/<slug>/component.json` mit
  `layout: { x, y, width, height }`.
- Reload zeigt den Node an exakt derselben Position und Größe.
- IST-View bleibt read-only (Palette nicht sichtbar, `nodes-draggable=false`).

## Verifizierter Ausgangspunkt

Beim Lesen der HEAD gefunden:

| Datei | Befund |
|---|---|
| [src/core/schemas.ts:26-37](../src/core/schemas.ts#L26-L37) | `NodeSchema` hat `.catchall(z.unknown())`, akzeptiert Extra-Felder — Layout kann eingebettet werden. |
| [src/storage/soll.ts:94](../src/storage/soll.ts#L94) | `saveSoll(repoRoot, model)` existiert bereits (wird bisher nur in Tests aufgerufen). |
| [src/storage/bucket.ts:6-11](../src/storage/bucket.ts#L6-L11) | Unterstützte Node-Typen: `component`, `module`, `external-service`, `data-store`. |
| [frontend/server/api/soll.get.ts](../frontend/server/api/soll.get.ts) | GET vorhanden, kein POST/PUT. |
| [frontend/server/utils/soll.ts](../frontend/server/utils/soll.ts) | Nur `loadSollForRequest`, kein Save-Wrapper. |
| [frontend/pages/index.vue:371-373](../frontend/pages/index.vue#L371-L373) | `VueFlow` läuft mit `nodes-draggable=false` und `nodes-connectable=false`. Header hat nur SOLL/IST-Umschalter, keine Palette. |
| [frontend/composables/useElkLayout.ts](../frontend/composables/useElkLayout.ts) | Berechnet Positionen serverseitig-frei; im Authoring-Modus wollen wir **persistierte** Positionen bevorzugen und ELK nur als Fallback nutzen. |
| [frontend/package.json:vue-flow](../frontend/package.json) | Nur `@vue-flow/core` + `@vue-flow/background`. `@vue-flow/node-resizer` und `@vue-flow/node-toolbar` fehlen. |

## Bedienkonzept

- **Palette** (linke Sidebar) — sichtbar nur wenn `view === "soll"`. Sie zeigt
  die vier unterstützten Node-Typen als Draggables. HTML5-Drag mit
  `dataTransfer.setData("application/specifyr-node-type", type)`.
- **Canvas** — auf `dragover.preventDefault` und `drop` wird ein neuer Node
  am Drop-Ort erzeugt (`useVueFlow().screenToFlowCoordinate`).
- **Edges** — Handles am Custom-Node werden im SOLL-Mode als `connectable`
  gerendert; `onConnect` fügt der `edges`-Liste einen neuen Eintrag hinzu.
- **Delete** — Vue-Flow feuert `onNodesChange` / `onEdgesChange` bei Delete/
  Backspace automatisch, sobald `deleteKeyCode` gesetzt ist.
- **Save** — jede lokale Mutation triggert einen debounced `POST /api/soll`
  mit dem vollständigen Modell (Optimistic; keine Konfliktauflösung in v1).
- **IST bleibt read-only** — die Palette und alle Handle-/Drag-Optionen sind
  hinter `isAuthoring = view === "soll"` gekapselt.

## Architektur-Überblick

```
┌── Backend (src/) ────────────────────────────────────────────┐
│  core/schemas.ts        ← optionales LayoutSchema hinzufügen │
│  storage/soll.ts        ← unverändert, saveSoll akzeptiert   │
│                           layout durch catchall bereits      │
└──────────────────────────────────────────────────────────────┘
                              ▲
                              │  workspace:*
┌── Frontend (frontend/) ──────┴───────────────────────────────┐
│  server/api/soll.post.ts      ← neu, validiert + persistiert │
│  server/utils/soll.ts         ← +saveSollForRequest          │
│  composables/use-authoring.ts ← neu, Save-Debounce + Mutate  │
│  composables/new-node.ts      ← neu, Palette→Node-Fabrik     │
│  components/editor/           ← neu:                         │
│    NodePalette.vue            ← Drag-Quelle                  │
│    EditableNode.vue           ← Custom-Node mit Resizer      │
│  pages/index.vue              ← refactor: Palette einbetten, │
│                                 Authoring-Handler verdrahten │
└──────────────────────────────────────────────────────────────┘
```

## Nicht enthalten (Scope-Grenzen)

- **Konfliktauflösung / mehrere Autoren** — v1 nimmt die letzte POST als Wahrheit.
- **Undo/Redo** — Vue-Flow hat keinen History-Stack; separate Runde.
- **Grouping via `parentNode`** — Container/verschachtelte Boxen sind ausdrücklich
  nicht Teil dieses Plans. Wird als Folge-Slice separat geplant.
- **Attribut-Editor pro Node** (Namen umbenennen, Klassen/Methoden pflegen) —
  v1 setzt Name = Node-ID = frei generierter Slug; Rename kommt später.
- **Autospeichern-Statusanzeige** — nur stille Persistenz; Fehler-Toast reicht.
- **Node-Typ-spezifische Palette pro Rolle** aus Plan 005 — hier werden die
  vier bestehenden `SUPPORTED_NODE_TYPES` als Palette gezeigt.
- **Löschen via Kontextmenü** — nur Delete/Backspace-Taste in v1.

## Datenmodell-Erweiterung

`NodeSchema` erhält ein optionales `layout`-Feld:

```ts
export const LayoutSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});
export type Layout = z.infer<typeof LayoutSchema>;
```

Kein Bruch, weil `layout?` optional ist und die bestehenden Loads/Saves das
Feld über den `catchall` bereits durchreichen. Nur im Frontend wird das Feld
gelesen und geschrieben; Extraktoren (`ist`) setzen es nicht.

---

## Schnitt A — Layout-Schema + Roundtrip-Test

**Ziel:** `layout` als offizielles Optional-Feld in `NodeSchema` verankern und
per Roundtrip-Test sicherstellen, dass es durch `saveSoll`/`loadSoll` überlebt.

### Dateien

- Modifizieren: [src/core/schemas.ts](../src/core/schemas.ts) — `LayoutSchema` + `NodeSchema.layout?`
- Modifizieren: [tests/storage/soll.roundtrip.test.ts](../tests/storage/soll.roundtrip.test.ts) — neuer Test „preserves layout"

### Schritte

1. **Failing test.** In [tests/storage/soll.roundtrip.test.ts](../tests/storage/soll.roundtrip.test.ts) ergänzen:
   ```ts
   it("preserves node layout across save-then-load", async () => {
     const source: Model = {
       meta: { source: "soll" },
       nodes: [
         {
           id: "auth",
           type: "component",
           name: "Auth",
           classes: [],
           layout: { x: 120, y: 40, width: 200, height: 96 },
         },
       ],
       edges: [],
     };
     await saveSoll(repoRoot, source);
     const loaded = await loadSoll(repoRoot);
     expect(loaded.nodes[0].layout).toEqual({
       x: 120,
       y: 40,
       width: 200,
       height: 96,
     });
   });
   ```
2. **Test laufen lassen** — muss fehlschlagen, weil `catchall` `layout` derzeit
   als `unknown` beibehält (nicht typisiert) und ggf. beim Roundtrip als Zahl
   in String konvertiert würde:
   ```bash
   pnpm test tests/storage/soll.roundtrip.test.ts -t "preserves node layout"
   ```
   Erwartet: **rot** (entweder Type-Fehler oder Vergleichs-Fehlschlag).
3. **Schema erweitern.** In [src/core/schemas.ts](../src/core/schemas.ts) vor
   `NodeSchema` ergänzen:
   ```ts
   export const LayoutSchema = z.object({
     x: z.number(),
     y: z.number(),
     width: z.number().positive().optional(),
     height: z.number().positive().optional(),
   });
   export type Layout = z.infer<typeof LayoutSchema>;
   ```
   Innerhalb `NodeSchema` (vor dem `.catchall`):
   ```ts
   layout: LayoutSchema.optional(),
   ```
4. **Test grün:**
   ```bash
   pnpm test tests/storage/soll.roundtrip.test.ts
   ```
5. **Volle Suite:**
   ```bash
   pnpm build && pnpm typecheck && pnpm test
   ```
   Erwartet: grün, weil `layout?` optional ist und alte Fixtures nichts setzen.
6. **Commit:**
   ```
   feat(schemas): add optional layout field to Node for editor persistence
   ```

---

## Schnitt B — Write-Endpoint `POST /api/soll`

**Ziel:** HTTP-Weg, um ein vollständiges SOLL-Modell aus dem Editor
zurückzuschreiben. Validierung liegt komplett bei `saveSoll`.

### Dateien

- Erstellen: `frontend/server/api/soll.post.ts`
- Modifizieren: [frontend/server/utils/soll.ts](../frontend/server/utils/soll.ts) — `saveSollForRequest`
- Erstellen: `tests/frontend/api-soll-post.test.ts`

### Schritte

1. **Failing test.** In `tests/frontend/api-soll-post.test.ts`:
   ```ts
   import { describe, it, expect } from "vitest";
   import { mkdtemp, readFile } from "node:fs/promises";
   import { tmpdir } from "node:os";
   import { join } from "node:path";
   import { saveSollForRequest } from "../../frontend/server/utils/soll.ts";

   describe("saveSollForRequest", () => {
     it("persists a valid SOLL model to .specifyr/soll", async () => {
       const repo = await mkdtemp(join(tmpdir(), "specifyr-postsoll-"));
       await saveSollForRequest(repo, {
         meta: { source: "soll" },
         nodes: [
           {
             id: "auth",
             type: "component",
             name: "Auth",
             classes: [],
             layout: { x: 10, y: 20, width: 200, height: 80 },
           },
         ],
         edges: [],
       });
       const raw = await readFile(
         join(repo, ".specifyr", "soll", "components", "auth", "component.json"),
         "utf8",
       );
       const parsed = JSON.parse(raw);
       expect(parsed.layout).toEqual({ x: 10, y: 20, width: 200, height: 80 });
     });

     it("rejects a model whose meta.source is not 'soll'", async () => {
       const repo = await mkdtemp(join(tmpdir(), "specifyr-postsoll-"));
       await expect(
         saveSollForRequest(repo, {
           meta: { source: "ist" },
           nodes: [],
           edges: [],
         } as never),
       ).rejects.toThrow();
     });
   });
   ```
2. **Test laufen lassen** — muss rot sein („saveSollForRequest is not exported").
3. **Utility ergänzen.** In [frontend/server/utils/soll.ts](../frontend/server/utils/soll.ts):
   ```ts
   import { saveSoll } from "specifyr/storage";
   import { ModelSchema } from "specifyr";

   export async function saveSollForRequest(
     repoPath: string,
     model: unknown,
   ): Promise<void> {
     const parsed = ModelSchema.parse(model);
     if (parsed.meta.source !== "soll") {
       throw new Error(
         `soll.post: model.meta.source must be "soll", got "${parsed.meta.source}"`,
       );
     }
     await saveSoll(repoPath, parsed);
   }
   ```
   Falls `ModelSchema` noch nicht aus `specifyr` re-exportiert wird, bitte
   `src/index.ts` prüfen und ggf. dort ergänzen.
4. **API-Handler.** In `frontend/server/api/soll.post.ts`:
   ```ts
   import { resolveRepoPath } from "../utils/repo-path.js";
   import { saveSollForRequest } from "../utils/soll.js";

   export default defineEventHandler(async (event) => {
     try {
       const repoPath = resolveRepoPath(getQuery(event));
       const body = await readBody(event);
       await saveSollForRequest(repoPath, body);
       return { ok: true };
     } catch (cause) {
       const message = cause instanceof Error ? cause.message : String(cause);
       setResponseStatus(event, 400);
       return { error: message };
     }
   });
   ```
5. **Tests grün:**
   ```bash
   pnpm test tests/frontend/api-soll-post.test.ts
   ```
6. **Volle Suite:**
   ```bash
   pnpm build && pnpm typecheck && pnpm test
   ```
7. **Commit:**
   ```
   feat(editor): add POST /api/soll write endpoint backed by saveSoll
   ```

---

## Schnitt C — Node-Palette + Drag&Drop-Fabrik

**Ziel:** Sidebar mit den vier unterstützten Node-Typen als HTML5-Draggables.
Ein Drop auf die Fläche legt einen neuen Node an — vorerst **nur lokal im
Frontend-State**, keine Persistenz (kommt in Schnitt E).

### Dateien

- Erstellen: `frontend/composables/new-node.ts`
- Erstellen: `frontend/components/editor/NodePalette.vue`
- Modifizieren: [frontend/pages/index.vue](../frontend/pages/index.vue) — Palette einbinden, `onDrop`-Handler

### Schritte

1. **Slug-Utility + Fabrik.** In `frontend/composables/new-node.ts`:
   ```ts
   import type { Node } from "specifyr";
   import { SUPPORTED_NODE_TYPES } from "specifyr/storage";

   export type NewNodeType = (typeof SUPPORTED_NODE_TYPES)[number];

   /** Generate a schema-valid slug id from a name plus a random suffix. */
   export function makeNodeId(base: string, existing: ReadonlySet<string>): string {
     const slug = base
       .toLowerCase()
       .replace(/[^a-z0-9]+/g, "-")
       .replace(/^-+|-+$/g, "")
       .slice(0, 48) || "node";
     let candidate = slug;
     let i = 1;
     while (existing.has(candidate)) {
       candidate = `${slug}-${++i}`;
     }
     return candidate;
   }

   export function makeNewNode(
     type: NewNodeType,
     position: { x: number; y: number },
     existingIds: ReadonlySet<string>,
   ): Node {
     const id = makeNodeId(`new-${type}`, existingIds);
     const nameByType: Record<NewNodeType, string> = {
       component: "New Component",
       module: "New Module",
       "external-service": "New External Service",
       "data-store": "New Data Store",
     };
     return {
       id,
       type,
       name: nameByType[type],
       classes: [],
       layout: { x: position.x, y: position.y, width: 200, height: 80 },
     };
   }
   ```
2. **Palette-Komponente.** In `frontend/components/editor/NodePalette.vue`:
   ```vue
   <script setup lang="ts">
   import { SUPPORTED_NODE_TYPES } from "specifyr/storage";

   const labels: Record<(typeof SUPPORTED_NODE_TYPES)[number], string> = {
     component: "Component",
     module: "Module",
     "external-service": "External Service",
     "data-store": "Data Store",
   };

   function onDragStart(event: DragEvent, type: string): void {
     event.dataTransfer?.setData("application/specifyr-node-type", type);
     event.dataTransfer!.effectAllowed = "move";
   }
   </script>

   <template>
     <aside
       class="w-52 shrink-0 overflow-y-auto border-r border-zinc-300 bg-zinc-50 p-3 text-sm"
       aria-label="Node palette"
     >
       <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
         Palette
       </h2>
       <ul class="space-y-1">
         <li v-for="t in SUPPORTED_NODE_TYPES" :key="t">
           <div
             class="cursor-grab select-none rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100 active:cursor-grabbing"
             draggable="true"
             :data-node-type="t"
             @dragstart="(e) => onDragStart(e, t)"
           >
             {{ labels[t] }}
           </div>
         </li>
       </ul>
     </aside>
   </template>
   ```
3. **`pages/index.vue`** — Palette links vor dem `VueFlow`-Wrapper einbinden,
   sichtbar nur wenn `view === "soll"`:
   ```vue
   <div class="flex min-h-0 flex-1">
     <NodePalette v-if="view === 'soll'" />
     <div class="min-h-0 flex-1" @dragover.prevent @drop="onCanvasDrop">
       <VueFlow …>
   ```
   Handler oben im `<script setup>` ergänzen:
   ```ts
   import NodePalette from "../components/editor/NodePalette.vue";

   const { screenToFlowCoordinate } = useVueFlow();
   const localNodes = ref<Node[]>([]);
   const localEdges = ref<Edge[]>([]);

   // Whenever the server model changes (fetch resolves), replace local buffers.
   watch(data, (m) => {
     localNodes.value = m?.nodes ? [...m.nodes] : [];
     localEdges.value = m?.edges ? [...m.edges] : [];
   });

   function onCanvasDrop(event: DragEvent): void {
     if (view.value !== "soll") return;
     const type = event.dataTransfer?.getData(
       "application/specifyr-node-type",
     ) as NewNodeType | "";
     if (!type) return;
     const flowPos = screenToFlowCoordinate({
       x: event.clientX,
       y: event.clientY,
     });
     const existing = new Set(localNodes.value.map((n) => n.id));
     localNodes.value = [...localNodes.value, makeNewNode(type, flowPos, existing)];
   }
   ```
   Und in den bestehenden `flowNodes`/`flowEdges` Computeds `data.value.nodes`
   durch `localNodes.value` bzw. `localEdges.value` ersetzen.
4. **Positionen priorisieren.** In `flowNodes`:
   ```ts
   position:
     node.layout != null
       ? { x: node.layout.x, y: node.layout.y }
       : positions.value.get(node.id) ?? { x: 0, y: 0 },
   ```
5. **Verifikation manuell:**
   - `pnpm --filter specifyr-frontend dev` starten, Repo öffnen, SOLL wählen.
   - Palette-Item ziehen und im Canvas ablegen → neuer Node an Drop-Ort.
   - Reload → Node ist **weg** (noch keine Persistenz). Das ist erwartet.
6. **Automated:**
   ```bash
   pnpm typecheck && pnpm --filter specifyr-frontend build
   ```
7. **Commit:**
   ```
   feat(editor): drag-and-drop node palette adds SOLL nodes to canvas
   ```

---

## Schnitt D — Freies Verschieben, Resize, Löschen

**Ziel:** Bestehende und neue Nodes können frei bewegt, in der Größe verändert
und mit `Delete` gelöscht werden. Kanten löschbar via Selektion + Delete.

### Dateien

- Installieren: `@vue-flow/node-resizer` (Dependency)
- Modifizieren: [frontend/package.json](../frontend/package.json) (durch `pnpm add`)
- Erstellen: `frontend/components/editor/EditableNode.vue`
- Modifizieren: [frontend/pages/index.vue](../frontend/pages/index.vue) — `nodeTypes`, `nodes-draggable`, `deleteKeyCode`, Change-Handler

### Schritte

1. **Dependency:**
   ```bash
   pnpm --filter specifyr-frontend add @vue-flow/node-resizer
   ```
2. **`EditableNode.vue`.** Vue-Flow-Custom-Node, der im SOLL-Mode einen
   `NodeResizer` einblendet:
   ```vue
   <script setup lang="ts">
   import { Handle, Position, type NodeProps } from "@vue-flow/core";
   import { NodeResizer } from "@vue-flow/node-resizer";
   import "@vue-flow/node-resizer/dist/style.css";

   const props = defineProps<NodeProps<{ label: string; editable: boolean }>>();
   </script>

   <template>
     <div
       class="editable-node flex h-full w-full items-center justify-center rounded-md border border-zinc-400 bg-white px-2 py-1 text-xs"
     >
       <NodeResizer
         v-if="data.editable"
         :min-width="120"
         :min-height="48"
         line-class="!border-zinc-400"
         handle-class="!bg-zinc-500"
       />
       <Handle type="target" :position="Position.Top" :connectable="data.editable" />
       <span class="whitespace-pre-line text-center">{{ data.label }}</span>
       <Handle type="source" :position="Position.Bottom" :connectable="data.editable" />
     </div>
   </template>
   ```
3. **In `pages/index.vue`** registrieren:
   ```ts
   import EditableNode from "../components/editor/EditableNode.vue";
   import type {
     NodeChange,
     EdgeChange,
     NodeDragEvent,
   } from "@vue-flow/core";

   const nodeTypes = { editable: EditableNode };
   const isAuthoring = computed(() => view.value === "soll");
   ```
4. **`flowNodes`** anpassen:
   ```ts
   type: "editable",
   data: {
     label: `${node.name}\n(${node.type})`,
     editable: isAuthoring.value,
   },
   style: node.layout?.width && node.layout?.height
     ? { width: `${node.layout.width}px`, height: `${node.layout.height}px` }
     : undefined,
   ```
5. **`VueFlow`-Props** aktualisieren:
   ```vue
   <VueFlow
     :nodes="flowNodes"
     :edges="flowEdges"
     :nodes-draggable="isAuthoring"
     :nodes-connectable="isAuthoring"
     :elements-selectable="true"
     :delete-key-code="isAuthoring ? ['Delete', 'Backspace'] : null"
     @node-drag-stop="onNodeDragStop"
     @nodes-change="onNodesChange"
     @edges-change="onEdgesChange"
     …
   >
   ```
6. **Change-Handler** — mutieren `localNodes` / `localEdges`:
   ```ts
   function onNodeDragStop({ node }: NodeDragEvent): void {
     const target = localNodes.value.find((n) => n.id === node.id);
     if (!target) return;
     const prev = target.layout ?? { x: 0, y: 0 };
     target.layout = { ...prev, x: node.position.x, y: node.position.y };
     localNodes.value = [...localNodes.value];
   }

   function onNodesChange(changes: NodeChange[]): void {
     for (const c of changes) {
       if (c.type === "remove") {
         localNodes.value = localNodes.value.filter((n) => n.id !== c.id);
         localEdges.value = localEdges.value.filter(
           (e) => e.from !== c.id && e.to !== c.id,
         );
       } else if (c.type === "dimensions" && c.dimensions) {
         const target = localNodes.value.find((n) => n.id === c.id);
         if (!target) continue;
         const prev = target.layout ?? { x: 0, y: 0 };
         target.layout = {
           ...prev,
           width: c.dimensions.width,
           height: c.dimensions.height,
         };
         localNodes.value = [...localNodes.value];
       }
     }
   }

   function onEdgesChange(changes: EdgeChange[]): void {
     for (const c of changes) {
       if (c.type === "remove") {
         localEdges.value = localEdges.value.filter((e) => e.id !== c.id);
       }
     }
   }
   ```
7. **Verifikation manuell:**
   - SOLL: Node ziehen, Größe ändern, Delete drücken → Node verschwindet.
   - IST: `nodes-draggable` bleibt aus, Delete tut nichts.
   - `pnpm typecheck` grün.
8. **Commit:**
   ```
   feat(editor): free positioning, resize and delete for SOLL nodes and edges
   ```

---

## Schnitt E — Edge-Drawing via Handles

**Ziel:** Im SOLL-Mode zieht der Nutzer eine Kante zwischen zwei Handles.
Neue Kanten erhalten eine eindeutige ID und den Default-Typ `depends-on`.

### Dateien

- Modifizieren: [frontend/pages/index.vue](../frontend/pages/index.vue) — `onConnect`, Edge-ID-Fabrik

### Schritte

1. **Handler ergänzen** in `<script setup>`:
   ```ts
   import type { Connection } from "@vue-flow/core";

   function nextEdgeId(existing: ReadonlySet<string>): string {
     let i = existing.size + 1;
     while (existing.has(`e${i}`)) i++;
     return `e${i}`;
   }

   function onConnect(connection: Connection): void {
     if (!connection.source || !connection.target) return;
     const ids = new Set(localEdges.value.map((e) => e.id));
     localEdges.value = [
       ...localEdges.value,
       {
         id: nextEdgeId(ids),
         from: connection.source,
         to: connection.target,
         type: "depends-on",
       },
     ];
   }
   ```
2. **Am `VueFlow`-Element** verdrahten:
   ```vue
   @connect="onConnect"
   ```
3. **Verifikation manuell:**
   - Zwei Nodes anlegen, Handle-Drag → neue Kante mit Label `depends-on`.
   - Kante klicken, Delete → weg.
4. **Commit:**
   ```
   feat(editor): draw SOLL edges by dragging between node handles
   ```

---

## Schnitt F — Debounced Persistenz + Fehler-Toast

**Ziel:** Alle lokalen Mutationen werden nach 500 ms Idle-Zeit als vollständiges
Modell an `POST /api/soll` gesendet. Fehler werden als Toast angezeigt (kein
Rollback in v1 — der User sieht sofort, dass Speichern hakt).

### Dateien

- Erstellen: `frontend/composables/use-authoring.ts`
- Modifizieren: [frontend/pages/index.vue](../frontend/pages/index.vue) — Composable einbinden, Toast einblenden

### Schritte

1. **`use-authoring.ts`.** Kein externes Debounce-Package — kleine Handrolle:
   ```ts
   import { ref, watch } from "vue";
   import type { Edge, Model, Node } from "specifyr";

   export interface AuthoringHandle {
     saveError: Ref<string | undefined>;
     isSaving: Ref<boolean>;
     flushNow: () => Promise<void>;
   }

   export function useAuthoring(
     repoPath: Ref<string | undefined>,
     enabled: Ref<boolean>,
     nodes: Ref<Node[]>,
     edges: Ref<Edge[]>,
   ): AuthoringHandle {
     const saveError = ref<string | undefined>(undefined);
     const isSaving = ref(false);
     let timer: ReturnType<typeof setTimeout> | undefined;

     async function post(): Promise<void> {
       if (!repoPath.value || !enabled.value) return;
       isSaving.value = true;
       try {
         const body: Model = {
           meta: { source: "soll", generatedAt: new Date().toISOString() },
           nodes: nodes.value,
           edges: edges.value,
         };
         const res = await $fetch<{ ok?: boolean; error?: string }>(
           `/api/soll?repoPath=${encodeURIComponent(repoPath.value)}`,
           { method: "POST", body },
         );
         if (res.error) throw new Error(res.error);
         saveError.value = undefined;
       } catch (cause) {
         saveError.value = cause instanceof Error ? cause.message : String(cause);
       } finally {
         isSaving.value = false;
       }
     }

     watch([nodes, edges], () => {
       if (!enabled.value) return;
       if (timer) clearTimeout(timer);
       timer = setTimeout(post, 500);
     }, { deep: true });

     async function flushNow(): Promise<void> {
       if (timer) clearTimeout(timer);
       await post();
     }

     return { saveError, isSaving, flushNow };
   }
   ```
2. **In `pages/index.vue`** verdrahten (unterhalb der `localNodes`/`localEdges`):
   ```ts
   const { saveError, isSaving } = useAuthoring(
     repoPath,
     isAuthoring,
     localNodes,
     localEdges,
   );
   ```
   Und im Header-Bereich:
   ```vue
   <span v-if="isSaving" class="italic text-zinc-500">· saving…</span>
   <span
     v-if="saveError"
     class="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700"
     :title="saveError"
   >
     Save failed
   </span>
   ```
3. **Verifikation manuell (End-to-End):**
   - Fresh Repo öffnen, SOLL wählen.
   - Neuen Node ablegen, verschieben, resizen — nach 500 ms erscheint kurz
     „saving…", dann verschwindet es.
   - Terminal: `.specifyr/soll/components/<slug>/component.json` existiert
     mit korrektem `layout`.
   - Reload → Node erscheint an derselben Position/Größe.
   - Fehler-Pfad simulieren: `chmod -w .specifyr/soll` → nach nächster
     Mutation zeigt Header „Save failed" mit Tooltip.
4. **Automated:**
   ```bash
   pnpm build && pnpm typecheck && pnpm test
   ```
5. **Commit:**
   ```
   feat(editor): debounced persistence of SOLL edits to .specifyr/soll
   ```

---

## Schnitt G — Doku + Roadmap

### Dateien

- Modifizieren: [plans/README.md](README.md) — Tabelle um Eintrag 006 erweitern
- Modifizieren: [README.md](../README.md) — Editor-Status-Zeile ergänzen

### Schritte

1. **plans/README.md**-Tabelle:
   ```
   | [006](006-soll-authoring-canvas.md) | SOLL bearbeiten: Palette, freies Platzieren, Resize, Edge-Drawing, Persistenz | P1 | L | 001 | DRAFT |
   ```
2. **README-Statuszeile** (unter „Editor"):
   ```
   Slice SOLL-Authoring: Palette + Drag&Drop + Resize + Edge-Draw + Auto-Save. ✅
   ```
3. **Commit:**
   ```
   docs: record plan 006 completion in README and plans index
   ```

---

## Verifikations-Checkliste (nach dem letzten Schnitt)

- [ ] `pnpm build && pnpm typecheck && pnpm lint && pnpm test` — grün.
- [ ] Fresh Repo → SOLL leer → Palette-Drop legt Node, `.specifyr/soll/`
      entsteht neu mit korrektem `layout`.
- [ ] Node verschieben → Datei aktualisiert sich innerhalb 1 s.
- [ ] Node resizen → `layout.width`/`layout.height` in JSON aktualisiert.
- [ ] Handle-Drag zwischen zwei Nodes legt Kante an; Reload zeigt sie.
- [ ] Delete löscht Node **und** alle zugehörigen Kanten aus `.specifyr/soll/`.
- [ ] IST-View zeigt keine Palette, `nodes-draggable=false`, Delete tut nichts.
- [ ] `chmod -w .specifyr/soll` → Header zeigt „Save failed", Editor bleibt
      benutzbar; nach `chmod +w` verschwindet der Fehler beim nächsten Save.
- [ ] Node ohne `layout` (aus alter Fixture) wird weiterhin über ELK gelayoutet.

## Offene Fragen (nach Abschluss besprechen)

- **Rename/Attribut-Editor.** Wollen wir einen Sidebar-Editor für Name,
  Description, Classes/Methods pro Node oder reicht CLI-basierte Pflege?
- **Grouping via `parentNode`.** Container-Boxen („Frontend enthält
  Auth-Module") sind der nächste natürliche Schritt und brauchen ein
  separates Slice (Storage-Konsistenz, Layout-Semantik).
- **Undo/Redo.** Vue-Flow bietet keinen History-Stack — externe Lib
  (`@tanstack/history`? eigener Ring-Buffer?) oder Verzicht?
- **Konfliktauflösung.** Bei parallelen Editoren oder externem Edit an
  `.specifyr/soll/`: Last-Write-Wins reicht v1, aber irgendwann brauchen
  wir mtime-Vergleich oder ETag.
- **Namenskonvention neuer IDs.** Aktuell `new-component`, `new-component-2`,
  … — reicht das oder wollen wir sofort einen Prompt für den Anzeigenamen?
