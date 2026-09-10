# Plan 005: Visuelle Sprache übernehmen und paarweise SOLL/PLAN/IST-Diffs

> **Für Claude:** Dieser Plan wird task-für-task ausgeführt. Bevorzugte Sub-Skill:
> `superpowers:executing-plans` bzw. `superpowers:subagent-driven-development`.

- Status: DRAFT — abgestimmter Umsetzungsvorschlag, noch nicht implementiert.
- Priorität: P1; Aufwand: L (7 Schnitte); Risiko: MED (kein Datenmodell-Bruch,
  aber viele UI-Berührungspunkte und ein neues Backend-Endpoint).
- Geplant gegen specifyr `29ada1c`, 2026-09-08, auf Branch `docs/ist-hierarchy-design`.
- Referenz-Inspiration: [tt-a1i/archify](https://github.com/tt-a1i/archify)
  (MIT, © 2025 Cocoon AI / © 2026 tt-a1i) — Design-Tokens und Delta-State-Muster.
- Anschluss an: [Plan 001](001-editor-perspectives-and-state-comparison.md)
  „Perspektiven, SOLL/PLAN/IST-Vergleich". Dieser Plan liefert die visuelle
  Sprache und den ersten produktiven Diff — nicht den vollen Explorer.
- Ausgangspunkt: `/home/haex/Projekte/specifyr`.

## Ziel und Erfolgskriterium

Der Editor zeigt jede der drei Modell-Perspektiven (SOLL, PLAN, IST) in einer
gemeinsamen, rollenbasierten visuellen Sprache. Zusätzlich lassen sich beliebige
zwei Perspektiven paarweise überlagern (`SOLL↔PLAN`, `PLAN↔IST`, `SOLL↔IST`).
Unterschiede werden als `data-delta-state`-Marker an Nodes und Edges gerendert,
angelehnt an Archifys Delta-Semantik.

**Erfolg**, wenn folgendes ohne Handkorrektur funktioniert:

1. `pnpm specifyr editor <repo>` öffnet den Editor. Perspektiven-Umschalter zeigt
   `SOLL | PLAN | IST`. Vergleichs-Umschalter zeigt drei Paare.
2. Umschalten auf `SOLL↔IST` in einem Repo mit `.specifyr/soll/` und
   TypeScript-Quellen färbt Nodes:
   - **added** (nur in IST) → grüne Vollkontur.
   - **removed** (nur in SOLL) → rote gestrichelte Kontur.
   - **changed** (in beiden, aber Attribute drift) → amber punktiert.
   - **same** → 38 %!O(MISSING)pazität.
3. `.specifyr/plan/` liefert bei leerem Verzeichnis ein leeres Modell ohne Fehler;
   mit einem beispielhaften Plan-Node erscheint dieser in Perspektive `PLAN`
   und in Diffs `SOLL↔PLAN`, `PLAN↔IST` korrekt als `added`.
4. Toggle zwischen Dark/Light-Theme per `[data-theme]` am `<html>` ändert alle
   Rollen-Farben, ohne dass ein Node-CSS geändert werden muss.

## Verifizierter Ausgangspunkt

Beim Lesen der HEAD (`29ada1c`) gefunden:

| Datei | Befund |
|---|---|
| [src/core/schemas.ts:55](../src/core/schemas.ts#L55) | `MODEL_SOURCES = ["soll", "plan", "ist"]` bereits im Schema; `plan` ist gültig. |
| [src/storage/](../src/storage/) | Nur `soll.ts`, kein `plan.ts`. Keine Persistenz-Schicht für PLAN. |
| [frontend/server/api/](../frontend/server/api/) | `soll.get.ts` und `ist.get.ts` vorhanden, `plan.get.ts` fehlt. |
| [frontend/composables/node-type-classes.ts](../frontend/composables/node-type-classes.ts) | Node-Typ → Tailwind-Klasse hart verdrahtet, keine Rollen-Abstraktion, kein Theme-Token. |
| [frontend/pages/index.vue:22](../frontend/pages/index.vue#L22) | `type ViewSource = "soll" \| "ist";` — PLAN fehlt in der UI. |
| [frontend/nuxt.config.ts](../frontend/nuxt.config.ts) | Tailwind v4 via `@tailwindcss/vite`. Kein `shadcn-nuxt`. |
| [frontend/assets/css/tailwind.css](../frontend/assets/css/tailwind.css) | Nur `@import "tailwindcss";`. Keine Theme-Layer, keine Custom Properties. |
| [frontend/package.json](../frontend/package.json) | Keine `class-variance-authority`, kein `reka-ui`, kein `lucide`, kein `tailwind-merge`. |
| [frontend/components/](../frontend/components/) | Verzeichnis existiert nicht — Nuxt fällt derzeit auf Vue-Flow-Inline zurück. |
| [plans/README.md](README.md) | Hat bisher Einträge 001–004. Muss um 005 erweitert werden. |

## Bedienkonzept

Die TopBar wird um zwei Kontrollen zerlegt:

- **Perspektive** (Segmenter / Tabs): `SOLL | PLAN | IST` — Einzelansicht.
- **Vergleich** (Dropdown): `— | SOLL ↔ PLAN | PLAN ↔ IST | SOLL ↔ IST` —
  Union-Ansicht mit Delta-Markern.

Die beiden Kontrollen sind zueinander exklusiv: eine Vergleichs-Auswahl setzt
die Perspektive zurück und umgekehrt. Standard-Zustand: Perspektive `SOLL`.

Farbschlüssel im Vergleichsmodus:

| DeltaState | Bedeutung im Vergleich `A ↔ B` (`A` = Base, `B` = Kandidat) | Visuelle Behandlung |
|---|---|---|
| `same` | in beiden, keine Änderung | 38 %!O(MISSING)pazität, ruhig |
| `added` | nur in `B` (Kandidat hat's, Base nicht) | grüne Vollkontur, 3px |
| `removed` | nur in `A` (Base hat's, Kandidat nicht) | rote gestrichelte Kontur (7,5), 3px |
| `changed` | in beiden, aber Attribute drift (z. B. anderer `name`, andere `path`, andere `classes`) | amber punktiert (2,3), 3px |

Interpretation je Vergleichs-Paar (kognitiv, kein Code-Unterschied):

- `SOLL ↔ IST` — `added` = Code hat unbedachte Extras; `removed` = Design fordert, Code liefert nicht.
- `SOLL ↔ PLAN` — `added` = geplante Ergänzung; `removed` = geplante Streichung.
- `PLAN ↔ IST` — `added` = Code läuft dem Plan voraus; `removed` = Plan noch nicht umgesetzt.

## Architektur-Überblick

```
┌── Backend (src/) ────────────────────────────────────────────┐
│  storage/plan.ts        ← neu, spiegelt soll.ts              │
│  diff/model-diff.ts     ← neu, reine Funktion Model → Delta  │
│  core/schemas.ts        ← minimale Erweiterung (role?)       │
└──────────────────────────────────────────────────────────────┘
                              ▲
                              │  workspace:*
┌── Frontend (frontend/) ──────┴───────────────────────────────┐
│  server/api/plan.get.ts       ← neu                          │
│  server/utils/plan.ts         ← neu                          │
│  assets/css/tailwind.css      ← @theme mit Rollen-Tokens     │
│  components.json              ← neu (shadcn init)            │
│  components/ui/*              ← neu, shadcn-primitives       │
│  components/graph/RoleNode.vue ← neu, Custom Vue-Flow-Node   │
│  components/graph/RoleEdge.vue ← neu, Custom Vue-Flow-Edge   │
│  composables/node-role.ts     ← neu, Typ→Rolle-Mapping       │
│  composables/use-view-mode.ts ← neu, Perspektive/Vergleich   │
│  composables/use-diff.ts      ← neu, wrap model-diff         │
│  pages/index.vue              ← refactor: TopBar + Node/Edge │
└──────────────────────────────────────────────────────────────┘
```

## Nicht enthalten (Scope-Grenzen)

- **PLAN-Editing.** Nur Storage + Read + Anzeige. Schreib-API kommt frühestens
  in einem Folge-Plan, spätestens mit dem MCP-Slice.
- **Preset-System** (Blueprint / Editorial / Signal Flow) — ein Theme (Dark)
  + optional Light reichen für v1.
- **Motion/Animations** aus Archify (Trace, Story Trail, Guided Play).
- **Signaturebene der `changed`-Erkennung.** Erste Runde: `changed` wenn Node-Id
  gleich, aber irgendein anderes Feld (`name`, `type`, `path`, `classes`) unterschiedlich.
  Feinere Diffs pro Attribut später.
- **Persistenz der aktuellen Perspektive/Vergleich-Auswahl** (bleibt nur im
  Runtime-State; kein `localStorage`).
- **Neues UI für Role-Zuweisung** — Rolle wird optional aus dem YAML gelesen
  (`role: backend`), fällt sonst per Typ-Heuristik zurück.

---

## Schnitt A — shadcn-vue + Design-Tokens (Infrastruktur)

**Ziel:** shadcn-vue verfügbar machen, Rollen-Tokens als CSS-Custom-Properties
in Tailwind einbetten, Dark/Light-Theme-Toggle vorbereiten. **Kein sichtbarer
Effekt am Graphen** — nur Rüstzeug.

### Dateien

- Modifizieren: [frontend/package.json](../frontend/package.json)
- Modifizieren: [frontend/nuxt.config.ts](../frontend/nuxt.config.ts)
- Modifizieren: [frontend/assets/css/tailwind.css](../frontend/assets/css/tailwind.css)
- Erstellen: `frontend/components.json`
- Erstellen: `frontend/lib/utils.ts`
- Erstellen: `frontend/components/ui/` (Verzeichnis, Inhalt via CLI)
- Erstellen: `frontend/plugins/theme.client.ts`

### Schritte

1. **Dependency-Install.** Im `frontend/`-Workspace ausführen:
   ```bash
   cd frontend
   pnpm add reka-ui class-variance-authority clsx tailwind-merge lucide-vue-next
   pnpm add -D shadcn-nuxt
   ```
2. **`shadcn-nuxt` als Nuxt-Modul registrieren.** In [frontend/nuxt.config.ts](../frontend/nuxt.config.ts)
   ins `modules: []` (ggf. neu anlegen) hinzufügen: `"shadcn-nuxt"`. Konfiguration:
   ```ts
   shadcn: {
     prefix: "",
     componentDir: "./components/ui",
   },
   ```
3. **shadcn-vue initialisieren.** Aus `frontend/`:
   ```bash
   pnpm dlx shadcn-vue@latest init
   ```
   Prompts: TypeScript **yes**, Style **default**, Base color **slate**, CSS
   `assets/css/tailwind.css`, Utils `./lib/utils`, Components `./components/ui`.
   Ergebnis: `components.json`, `lib/utils.ts`, Tailwind-CSS mit `@theme`-Layer
   (Standard-Slate-Palette wird angelegt).
4. **Rollen-Tokens ergänzen.** In [frontend/assets/css/tailwind.css](../frontend/assets/css/tailwind.css)
   **unterhalb** der von shadcn erzeugten Blöcke einen eigenen Block einfügen.
   Verwende `@layer base`, damit Utility-Klassen weiterhin gewinnen können.
   Farben 1:1 aus Archifys `web-app.html` übernommen (Dark + Light):
   ```css
   /*
    * Role-based diagram tokens.
    * Design language inspired by Archify (MIT, © 2025 Cocoon AI, © 2026 tt-a1i).
    * https://github.com/tt-a1i/archify
    */
   @layer base {
     :root,
     [data-theme="dark"] {
       --graph-bg: #020617;
       --graph-grid: #1e293b;
       --graph-arrow: #64748b;
       --graph-arrow-emphasis: #34d399;
       --graph-mask: #0f172a;

       --role-frontend-fill:    rgba(8, 51, 68, 0.4);
       --role-frontend-stroke:  #22d3ee;
       --role-backend-fill:     rgba(6, 78, 59, 0.4);
       --role-backend-stroke:   #34d399;
       --role-database-fill:    rgba(76, 29, 149, 0.4);
       --role-database-stroke:  #a78bfa;
       --role-cloud-fill:       rgba(120, 53, 15, 0.3);
       --role-cloud-stroke:     #fbbf24;
       --role-external-fill:    rgba(30, 41, 59, 0.5);
       --role-external-stroke:  #94a3b8;
       --role-messagebus-fill:  rgba(251, 146, 60, 0.3);
       --role-messagebus-stroke:#fb923c;
       --role-security-fill:    rgba(136, 19, 55, 0.4);
       --role-security-stroke:  #fb7185;

       --delta-add:    #34d399;
       --delta-remove: #fb7185;
       --delta-change: #fbbf24;
       --delta-same-opacity: 0.38;
     }

     [data-theme="light"] {
       --graph-bg: #f8fafc;
       --graph-grid: #e2e8f0;
       --graph-arrow: #94a3b8;
       --graph-arrow-emphasis: #059669;
       --graph-mask: #ffffff;

       --role-frontend-fill:    rgba(34, 211, 238, 0.15);
       --role-frontend-stroke:  #0891b2;
       --role-backend-fill:     rgba(52, 211, 153, 0.18);
       --role-backend-stroke:   #059669;
       --role-database-fill:    rgba(167, 139, 250, 0.2);
       --role-database-stroke:  #7c3aed;
       --role-cloud-fill:       rgba(251, 191, 36, 0.18);
       --role-cloud-stroke:     #d97706;
       --role-external-fill:    rgba(148, 163, 184, 0.18);
       --role-external-stroke:  #64748b;
       --role-messagebus-fill:  rgba(251, 146, 60, 0.15);
       --role-messagebus-stroke:#ea580c;
       --role-security-fill:    rgba(251, 113, 133, 0.15);
       --role-security-stroke:  #e11d48;
     }
   }
   ```
5. **Default-Theme setzen.** In [frontend/nuxt.config.ts](../frontend/nuxt.config.ts)
   in `app.head.htmlAttrs` `data-theme: "dark"` ergänzen (neben `lang: "en"`).
6. **Zwei erste Primitiven installieren** (für Schnitt E gebraucht):
   ```bash
   pnpm dlx shadcn-vue@latest add button select tabs badge tooltip card
   ```
7. **Verifikation:**
   ```bash
   pnpm --filter specifyr-frontend build
   pnpm typecheck
   ```
   Erwartet: beide Kommandos grün, `frontend/components/ui/{button,select,tabs,badge,tooltip,card}.vue` (bzw. Unterverzeichnisse) angelegt.
8. **Commit** (nach jedem Schnitt einer):
   ```
   feat(editor): scaffold shadcn-vue and role-based design tokens
   ```

### Manuelle Sichtprüfung

Editor starten (`pnpm specifyr editor <repo>`), Devtools → `<html>` inspizieren:
`data-theme="dark"` gesetzt, im `:root` sind die `--role-*`-Variablen definiert.
Graph sieht optisch unverändert aus (Custom-Node kommt erst in Schnitt B).

---

## Schnitt B — Rollenbasiertes Node-Styling (Tailwind-first)

**Ziel:** Node-Typ → visuelle Rolle → Tailwind-Utility. Ersetzt die alten
Node-Type-Tailwind-Farbklassen aus `node-type-classes.ts`.

**Design-Entscheidung (2026-09-10):** Wir bleiben so weit wie möglich am
Tailwind-Workflow. Deshalb werden die in Schnitt A eingeführten Role- und
Delta-Tokens **zusätzlich** in den `@theme inline`-Block gehoben, wo die
shadcn-Chrome-Tokens bereits leben. Ergebnis: `bg-role-frontend-fill`,
`border-role-frontend-stroke`, `text-role-frontend-stroke`, `bg-delta-add`
etc. sind echte Tailwind-Utility-Klassen — kein `style="--fill: var(…)"`
Umweg mehr, kein `<style scoped>` im Custom-Node.

Trade-off, akzeptiert: Archifys Fill (`rgba(…, 0.4)`) und Stroke
(`#22d3ee`) sind **zwei handverlesene Farben pro Rolle**, keine Farbe mit
Alpha-Modifier — deshalb landen zwei Tokens pro Rolle in Tailwind
(`role-frontend-fill` + `role-frontend-stroke`) und nicht einer, den man
mit `/40` moduliert. Faithful zu Archify > Token-Minimalismus.

### Dateien

- Modifizieren: [src/core/schemas.ts](../src/core/schemas.ts) (optionales `role?`-Feld)
- Modifizieren: [frontend/assets/css/tailwind.css](../frontend/assets/css/tailwind.css) (Role/Delta-Tokens in `@theme inline` hochziehen)
- Erstellen: `frontend/composables/node-role.ts`
- Erstellen: `frontend/components/graph/RoleNode.vue`
- Modifizieren: [frontend/pages/index.vue](../frontend/pages/index.vue) (nodeTypes registrieren, Klassen entfernen)
- Löschen: [frontend/composables/node-type-classes.ts](../frontend/composables/node-type-classes.ts) (danach unbenutzt)
- Modifizieren/löschen: [tests/frontend/node-type-classes.test.ts](../tests/frontend/node-type-classes.test.ts) (analoge Coverage in `node-role.test.ts`)
- Modifizieren: [tests/cli/editor-ist-integration.test.ts](../tests/cli/editor-ist-integration.test.ts) (Bundle-Guard: `bg-blue-100`/`bg-purple-100` → eine der neuen role-classes)

### Schritte

1. **Schema-Erweiterung** ([src/core/schemas.ts](../src/core/schemas.ts)):
   Im `NodeSchema` vor dem `catchall` ergänzen:
   ```ts
   role: z
     .enum(["frontend", "backend", "database", "cloud", "external", "messagebus", "security"])
     .optional(),
   ```
   Export `NodeRole`-Typ hinzufügen.
2. **Tokens in `@theme inline` hochziehen.** In
   [frontend/assets/css/tailwind.css](../frontend/assets/css/tailwind.css) den
   bestehenden `@theme inline`-Block (der die shadcn-`--color-*`-Tokens hält)
   um Role- und Delta-Einträge ergänzen. Die zugrundeliegenden Werte bleiben
   in `@layer base` unverändert (Single Source of Truth):
   ```css
   @theme inline {
     /* … bestehende --color-background/foreground/… bleiben … */

     /* Role tokens — from Schnitt A's :root/@layer base block */
     --color-role-frontend-fill:    var(--role-frontend-fill);
     --color-role-frontend-stroke:  var(--role-frontend-stroke);
     --color-role-backend-fill:     var(--role-backend-fill);
     --color-role-backend-stroke:   var(--role-backend-stroke);
     --color-role-database-fill:    var(--role-database-fill);
     --color-role-database-stroke:  var(--role-database-stroke);
     --color-role-cloud-fill:       var(--role-cloud-fill);
     --color-role-cloud-stroke:     var(--role-cloud-stroke);
     --color-role-external-fill:    var(--role-external-fill);
     --color-role-external-stroke:  var(--role-external-stroke);
     --color-role-messagebus-fill:  var(--role-messagebus-fill);
     --color-role-messagebus-stroke:var(--role-messagebus-stroke);
     --color-role-security-fill:    var(--role-security-fill);
     --color-role-security-stroke:  var(--role-security-stroke);

     /* Delta tokens */
     --color-delta-add:    var(--delta-add);
     --color-delta-remove: var(--delta-remove);
     --color-delta-change: var(--delta-change);
   }
   ```
   Ergebnis: `bg-role-frontend-fill`, `border-role-frontend-stroke`,
   `text-role-frontend-stroke`, `bg-delta-add`, etc. sind ab jetzt echte
   Tailwind-Utilities.
3. **Composable `node-role.ts`.** Reine Funktion + statische Klassen-Map
   (Tailwinds Scanner sieht jede Klasse literal, keine dynamische Klassenbildung):
   ```ts
   import type { Node, NodeRole } from "specifyr";

   const TYPE_ROLE_FALLBACK: Record<string, NodeRole> = {
     component: "backend",
     module: "frontend",
     "external-service": "external",
     "data-store": "database",
     class: "frontend",
     interface: "frontend",
     "type-alias": "frontend",
     enum: "frontend",
     function: "frontend",
   };

   export function nodeRole(node: Pick<Node, "type" | "role">): NodeRole {
     return node.role ?? TYPE_ROLE_FALLBACK[node.type] ?? "external";
   }

   /**
    * Static role → Tailwind class-string map. Every class listed here is a
    * real utility built at Tailwind scan time (see the role tokens in
    * `tailwind.css`'s `@theme inline` block). Do NOT compose the class
    * string dynamically (`bg-role-${role}-fill` etc.) — Tailwind's static
    * scanner would miss it and no CSS would ship for those utilities.
    */
   export const ROLE_CLASSES: Record<NodeRole, string> = {
     frontend:   "bg-role-frontend-fill border-role-frontend-stroke text-role-frontend-stroke",
     backend:    "bg-role-backend-fill border-role-backend-stroke text-role-backend-stroke",
     database:   "bg-role-database-fill border-role-database-stroke text-role-database-stroke",
     cloud:      "bg-role-cloud-fill border-role-cloud-stroke text-role-cloud-stroke",
     external:   "bg-role-external-fill border-role-external-stroke text-role-external-stroke",
     messagebus: "bg-role-messagebus-fill border-role-messagebus-stroke text-role-messagebus-stroke",
     security:   "bg-role-security-fill border-role-security-stroke text-role-security-stroke",
   };
   ```
4. **`RoleNode.vue`.** Vue-Flow-Custom-Node — pure Tailwind-Utilities, kein
   inline-style, kein scoped `<style>`:
   ```vue
   <script setup lang="ts">
   import { computed } from "vue";
   import { Handle, Position, type NodeProps } from "@vue-flow/core";
   import { nodeRole, ROLE_CLASSES } from "../../composables/node-role.js";

   const props = defineProps<NodeProps>();
   const role = computed(() => nodeRole(props.data.node));
   const roleClasses = computed(() => ROLE_CLASSES[role.value]);
   </script>

   <template>
     <div
       class="rounded-md border-2 px-3 py-2 text-sm font-medium"
       :class="roleClasses"
       :data-role="role"
       :data-delta-state="data.deltaState ?? 'same'"
     >
       <Handle type="target" :position="Position.Top" />
       <div>{{ label }}</div>
       <div v-if="data.node.path" class="mt-0.5 text-[0.65rem] opacity-70">
         {{ data.node.path }}
       </div>
       <Handle type="source" :position="Position.Bottom" />
     </div>
   </template>
   ```
5. **In `pages/index.vue` verdrahten.** In der `VueFlow`-Instanz `:node-types`
   registrieren:
   ```ts
   import RoleNode from "../components/graph/RoleNode.vue";
   const nodeTypes = { role: RoleNode };
   ```
   In der `flowNodes.map()`:
   - `type: "role"` (nicht mehr `default`)
   - `data: { node, deltaState: undefined }` — Node vollständig durchreichen
   - Die Zeile `class: nodeTypeClasses(...)` entfernen.
6. **Alte Datei + Test löschen.** `frontend/composables/node-type-classes.ts`
   entfernen und alle Imports (nur `pages/index.vue`) mit rausfliegen lassen.
   `tests/frontend/node-type-classes.test.ts` durch `tests/frontend/node-role.test.ts`
   ersetzen (gleiche Testfälle: TYPE_ROLE_FALLBACK Coverage + expliziter
   `role`-Override im Node schlägt Fallback).
7. **Bundle-Guard nachziehen.** In
   [tests/cli/editor-ist-integration.test.ts](../tests/cli/editor-ist-integration.test.ts)
   den Tailwind-Sanity-Check anpassen: die alten `bg-blue-100` / `bg-purple-100`
   Klassen (aus `nodeTypeClasses`) sind weg; stattdessen auf eine der neuen
   role-classes prüfen, z.B. `bg-role-frontend-fill` oder
   `border-role-backend-stroke`. Kommentar aktualisieren.
8. **Verifikation:**
   ```bash
   pnpm typecheck && pnpm lint && pnpm test
   pnpm --filter specifyr-frontend build
   ```
   Erwartet: Grün. Sichtprüfung im Browser (nach Editor-Restart):
   - Alle Nodes tragen die neuen Rollen-Farben, Farbschema entspricht Archify-Look
   - Kein Node ist ungestylt
   - IST-Symbol-Nodes (`class`, `interface`, `function`, `type-alias`, `enum`)
     bekommen alle die `frontend`-Rolle (per Fallback) — visuell konsistente Familie
9. **Commit:**
   ```
   feat(editor): drive node colors from role tokens as Tailwind utilities
   ```

---

## Schnitt C — PLAN-Storage + `/api/plan`

**Ziel:** `.specifyr/plan/` lesen können. Struktur analog zu SOLL, aber unter
`plan/` statt `soll/`. Kein Schreib-Endpoint.

### Dateien

- Erstellen: `src/storage/plan.ts`
- Modifizieren: [src/storage/index.ts](../src/storage/index.ts) (re-export)
- Modifizieren: [src/storage/paths.ts](../src/storage/paths.ts) (parallel `planRoot`)
- Erstellen: `tests/storage/plan.test.ts`
- Erstellen: `frontend/server/api/plan.get.ts`
- Erstellen: `frontend/server/utils/plan.ts`

### Schritte

1. **Test zuerst.** `tests/storage/plan.test.ts`:
   ```ts
   import { describe, it, expect } from "vitest";
   import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
   import { tmpdir } from "node:os";
   import { join } from "node:path";
   import { loadPlan } from "../../src/storage/plan.js";

   describe("plan storage", () => {
     it("returns empty model when .specifyr/plan does not exist", async () => {
       const repo = await mkdtemp(join(tmpdir(), "specifyr-plan-"));
       const model = await loadPlan(repo);
       expect(model.nodes).toEqual([]);
       expect(model.edges).toEqual([]);
       expect(model.meta.source).toBe("plan");
     });

     it("reads nodes and edges written under .specifyr/plan", async () => {
       const repo = await mkdtemp(join(tmpdir(), "specifyr-plan-"));
       const dir = join(repo, ".specifyr", "plan", "components");
       await mkdir(dir, { recursive: true });
       await writeFile(
         join(dir, "foo.yaml"),
         "id: foo\ntype: component\nname: Foo\n",
         "utf8",
       );
       const model = await loadPlan(repo);
       expect(model.nodes).toHaveLength(1);
       expect(model.nodes[0].id).toBe("foo");
       expect(model.meta.source).toBe("plan");
     });
   });
   ```
2. **Test laufen lassen** — muss **fehlschlagen** mit „loadPlan not exported":
   ```bash
   pnpm test tests/storage/plan.test.ts
   ```
3. **Minimal-Implementierung `src/storage/plan.ts`.** `soll.ts` als Vorlage
   kopieren, aber:
   - alle Import-Pfade `sollRoot` → `planRoot`
   - Konstante `SOLL_DIR = "soll"` → `PLAN_DIR = "plan"`
   - Meta-Erzeugung setzt `source: "plan"`
   - Öffentliche Funktion `loadPlan(repoPath: string): Promise<Model>`
   - Falls das Verzeichnis fehlt: leeres Modell mit `meta.source = "plan"` zurückgeben (nicht werfen).
4. **`paths.ts` erweitern.** `planRoot(repoPath)` analog `sollRoot(repoPath)` exportieren.
5. **Re-Export** in [src/storage/index.ts](../src/storage/index.ts) hinzufügen.
6. **Tests grün:**
   ```bash
   pnpm test tests/storage/plan.test.ts
   ```
7. **API-Endpoint.** `frontend/server/utils/plan.ts` analog zu `soll.ts`
   (Cache-Handling gleich), dann `frontend/server/api/plan.get.ts` als
   1:1-Kopie von `soll.get.ts` mit `loadPlanForRequest` statt `loadSollForRequest`.
8. **Verifikation:**
   ```bash
   pnpm build && pnpm typecheck && pnpm test
   ```
9. **Commit:**
   ```
   feat(storage): add PLAN storage layer and /api/plan read endpoint
   ```

---

## Schnitt D — Model-Diff-Engine

**Ziel:** Reine Funktion, testbar isoliert, zwei Modelle → Delta-Maps.

### Dateien

- Erstellen: `src/diff/model-diff.ts`
- Erstellen: `src/diff/index.ts`
- Modifizieren: [package.json](../package.json) — neuer Subpath-Export `./diff`
  analog zu `./storage`
- Erstellen: `tests/diff/model-diff.test.ts`

### Schritte

1. **Test zuerst.** `tests/diff/model-diff.test.ts`:
   ```ts
   import { describe, it, expect } from "vitest";
   import { diffModels } from "../../src/diff/model-diff.js";
   import type { Model } from "../../src/core/schemas.js";

   const m = (nodes: Model["nodes"], edges: Model["edges"] = []): Model => ({
     nodes, edges, meta: { source: "soll" },
   });

   describe("diffModels", () => {
     it("marks nodes only in base as removed and only in candidate as added", () => {
       const base = m([{ id: "a", type: "component", name: "A", classes: [] }]);
       const cand = m([{ id: "b", type: "component", name: "B", classes: [] }]);
       const d = diffModels(base, cand);
       expect(d.nodes.get("a")).toBe("removed");
       expect(d.nodes.get("b")).toBe("added");
     });

     it("marks nodes present in both with equal fields as same", () => {
       const n = { id: "a", type: "component", name: "A", classes: [] };
       const d = diffModels(m([n]), m([n]));
       expect(d.nodes.get("a")).toBe("same");
     });

     it("marks nodes present in both with drifted attributes as changed", () => {
       const d = diffModels(
         m([{ id: "a", type: "component", name: "A", classes: [] }]),
         m([{ id: "a", type: "component", name: "A renamed", classes: [] }]),
       );
       expect(d.nodes.get("a")).toBe("changed");
     });

     it("diffs edges by id", () => {
       const base = m([], [{ id: "e1", from: "a", to: "b", type: "imports" }]);
       const cand = m([], [{ id: "e2", from: "a", to: "b", type: "imports" }]);
       const d = diffModels(base, cand);
       expect(d.edges.get("e1")).toBe("removed");
       expect(d.edges.get("e2")).toBe("added");
     });
   });
   ```
2. **Test laufen lassen** — rot.
3. **Implementieren** `src/diff/model-diff.ts`:
   ```ts
   import type { Edge, Model, Node } from "../core/schemas.js";

   export type DeltaState = "same" | "added" | "removed" | "changed";

   export interface ModelDiff {
     nodes: Map<string, DeltaState>;
     edges: Map<string, DeltaState>;
   }

   const COMPARED_NODE_FIELDS = ["type", "name", "path", "description"] as const;

   function nodesDiffer(a: Node, b: Node): boolean {
     for (const key of COMPARED_NODE_FIELDS) {
       if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) return true;
     }
     if (JSON.stringify(a.classes) !== JSON.stringify(b.classes)) return true;
     return false;
   }

   function edgesDiffer(a: Edge, b: Edge): boolean {
     return a.from !== b.from || a.to !== b.to || a.type !== b.type;
   }

   export function diffModels(base: Model, candidate: Model): ModelDiff {
     const nodes = new Map<string, DeltaState>();
     const edges = new Map<string, DeltaState>();

     const baseNodes = new Map(base.nodes.map((n) => [n.id, n]));
     const candNodes = new Map(candidate.nodes.map((n) => [n.id, n]));
     for (const [id, n] of baseNodes) {
       const c = candNodes.get(id);
       if (!c) nodes.set(id, "removed");
       else nodes.set(id, nodesDiffer(n, c) ? "changed" : "same");
     }
     for (const [id] of candNodes) if (!baseNodes.has(id)) nodes.set(id, "added");

     const baseEdges = new Map(base.edges.map((e) => [e.id, e]));
     const candEdges = new Map(candidate.edges.map((e) => [e.id, e]));
     for (const [id, e] of baseEdges) {
       const c = candEdges.get(id);
       if (!c) edges.set(id, "removed");
       else edges.set(id, edgesDiffer(e, c) ? "changed" : "same");
     }
     for (const [id] of candEdges) if (!baseEdges.has(id)) edges.set(id, "added");

     return { nodes, edges };
   }
   ```
4. **Re-Export** `src/diff/index.ts` (re-exports `./model-diff.js`), plus
   `package.json`-Eintrag:
   ```json
   "./diff": {
     "types": "./dist/diff/index.d.ts",
     "import": "./dist/diff/index.js"
   }
   ```
   Consumern verfügbar als `import { diffModels } from "specifyr/diff"`.
5. **Test grün:**
   ```bash
   pnpm test tests/diff/model-diff.test.ts
   ```
6. **Commit:**
   ```
   feat(core): add model diff engine for SOLL/PLAN/IST pairs
   ```

---

## Schnitt E — TopBar-Umbau (Perspektive + Vergleich mit shadcn)

**Ziel:** Bestehende Segment-Umschaltung ersetzen. UI komplett aus shadcn-Primitiven.

### Dateien

- Erstellen: `frontend/composables/use-view-mode.ts`
- Erstellen: `frontend/composables/use-diff.ts`
- Erstellen: `frontend/components/editor/TopBar.vue`
- Modifizieren: [frontend/pages/index.vue](../frontend/pages/index.vue) (TopBar ausgliedern, Fetch-Logik anpassen)

### Schritte

1. **`use-view-mode.ts`.** State + reine Setter (kein Persistenz):
   ```ts
   import { ref, computed, readonly } from "vue";
   import type { ModelSource } from "specifyr";

   export type ViewMode =
     | { kind: "single"; source: ModelSource }
     | { kind: "diff"; base: ModelSource; candidate: ModelSource };

   const mode = ref<ViewMode>({ kind: "single", source: "soll" });

   export function useViewMode() {
     const setSingle = (source: ModelSource) => (mode.value = { kind: "single", source });
     const setDiff = (base: ModelSource, candidate: ModelSource) =>
       (mode.value = { kind: "diff", base, candidate });
     const sources = computed<ModelSource[]>(() =>
       mode.value.kind === "single"
         ? [mode.value.source]
         : [mode.value.base, mode.value.candidate],
     );
     return { mode: readonly(mode), sources, setSingle, setDiff };
   }
   ```
2. **`use-diff.ts`.** Nimmt zwei bereits geladene Modelle und liefert die
   Delta-Maps als Computed. Dünn — die Logik lebt im Core.
3. **`TopBar.vue`.** Nutzt `Tabs` (Perspektive) und `Select` (Vergleich) von shadcn.
   Layout einfach: links Perspektive, Trennstrich, rechts Vergleich, ganz rechts
   Suchfeld (bestehendes Input) + Theme-Toggle (Button mit Sun/Moon-Icon aus
   `lucide-vue-next`). Emits: `update:mode`, `update:query`.
4. **`pages/index.vue` refaktorisieren.**
   - `<TopBar>` einbetten, alte Toggle-Buttons entfernen.
   - Statt `endpoint = computed(...)` → für jede benötigte Quelle
     (`sources.value`) `useFetch` starten und in einem Map cachen. Konkret:
     drei feste `useFetch`-Hooks (`sollFetch`, `planFetch`, `istFetch`), jeweils
     `immediate: false`; ein Watcher startet die relevanten neu, sobald Repo
     oder Modus-Quellen wechseln.
   - Beim Kombinieren der Modelle für den Graphen:
     - `single` → Nodes/Edges des einen Modells, `deltaState = undefined`.
     - `diff` → Union der Nodes/Edges beider Modelle (Merge nach `id`,
       Präferenz Kandidat), `deltaState` aus der Diff-Map je Node/Edge.
5. **Verifikation:**
   - `pnpm typecheck` grün.
   - Editor öffnen, Perspektive umschalten → Netzwerk-Tab zeigt genau einen
     `GET /api/{soll|plan|ist}`.
   - Auf `SOLL ↔ IST` schalten → zwei Requests parallel, Graph zeigt Union.
   - `data-delta-state` an einzelnen Nodes im DOM sichtbar (Devtools inspizieren).
6. **Commit:**
   ```
   feat(editor): perspective and comparison selectors with shadcn top bar
   ```

---

## Schnitt F — Delta-Styling für Nodes und Edges

**Ziel:** `data-delta-state` visuell umsetzen — Nodes (Schnitt B vorbereitet)
und Edges (neu). Farben aus den Tokens von Schnitt A.

### Dateien

- Modifizieren: [frontend/assets/css/tailwind.css](../frontend/assets/css/tailwind.css) (Delta-Regeln)
- Erstellen: `frontend/components/graph/RoleEdge.vue`
- Modifizieren: [frontend/pages/index.vue](../frontend/pages/index.vue) (`edgeTypes` registrieren, `data.deltaState` auf Edges setzen)

### Schritte

1. **Delta-CSS ergänzen.** Nach dem `@layer base` in `tailwind.css`:
   ```css
   @layer components {
     /* Node deltas — treat both custom-node markers and generic wrappers. */
     .role-node[data-delta-state="added"]   { border-color: var(--delta-add)    !important; border-style: solid;  border-width: 3px; }
     .role-node[data-delta-state="removed"] { border-color: var(--delta-remove) !important; border-style: dashed; border-width: 3px; }
     .role-node[data-delta-state="changed"] { border-color: var(--delta-change) !important; border-style: dotted; border-width: 3px; }
     .vue-flow[data-view="diff"] .role-node[data-delta-state="same"] { opacity: var(--delta-same-opacity); }

     /* Edges: styled via SVG stroke in RoleEdge.vue, but we keep the same-opacity rule here. */
     .vue-flow[data-view="diff"] .vue-flow__edge[data-delta-state="same"] { opacity: var(--delta-same-opacity); }
   }
   ```
2. **`RoleEdge.vue`.** Custom-Edge, die aus `data.deltaState` Stroke/Dasharray ableitet:
   ```vue
   <script setup lang="ts">
   import { computed } from "vue";
   import { BaseEdge, getBezierPath, type EdgeProps } from "@vue-flow/core";

   const props = defineProps<EdgeProps>();
   const [path] = getBezierPath(props);
   const stroke = computed(() => {
     switch (props.data?.deltaState) {
       case "added":   return "var(--delta-add)";
       case "removed": return "var(--delta-remove)";
       case "changed": return "var(--delta-change)";
       default:        return "var(--graph-arrow)";
     }
   });
   const dashArray = computed(() => {
     switch (props.data?.deltaState) {
       case "removed": return "7 5";
       case "changed": return "2 3";
       default:        return undefined;
     }
   });
   </script>

   <template>
     <BaseEdge
       :id="id"
       :path="path"
       :style="{ stroke, strokeWidth: data?.deltaState && data.deltaState !== 'same' ? 3 : 1.5, strokeDasharray: dashArray }"
     />
   </template>
   ```
3. **In `pages/index.vue` registrieren.**
   ```ts
   import RoleEdge from "../components/graph/RoleEdge.vue";
   const edgeTypes = { role: RoleEdge };
   // in edges.map: type: "role", data: { deltaState: … }
   ```
   Außerdem am `<VueFlow>`-Element `:data-view="mode.kind"` setzen (damit die
   `.vue-flow[data-view="diff"]`-Regeln greifen).
4. **Manuelle Verifikation:**
   - Repo mit SOLL-Nodes wählen.
   - Auf `SOLL ↔ IST` schalten. Vorhandene SOLL-only-Nodes: rote gestrichelte Kontur.
     IST-only-Module (aus TypeScript): grüne Vollkontur. Gemeinsame Nodes: 38 %!O(MISSING)pak.
   - Auf `SOLL ↔ PLAN` bei leerem PLAN: **alle** Nodes rot gestrichelt (removed vs. leeres PLAN).
5. **Commit:**
   ```
   feat(editor): render delta states on nodes and edges in diff views
   ```

---

## Schnitt G — Dokumentation & Roadmap-Update

### Dateien

- Modifizieren: [README.md](../README.md) (Slice-Liste im Status-Abschnitt)
- Modifizieren: [plans/README.md](README.md) (Tabelle um 005 erweitern)
- Modifizieren: [frontend/assets/css/tailwind.css](../frontend/assets/css/tailwind.css) (falls Kredit-Kommentar noch fehlt)

### Schritte

1. **README-Statuszeile** ergänzen:
   ```
   Slice Visual/Diff: shadcn-vue-Primitiven, rollenbasierte Tokens aus Archify,
     PLAN-Storage + /api/plan, Diff-Engine, paarweise Vergleichs-Views. ✅
   ```
2. **plans/README.md**-Tabelle um Eintrag 005 erweitern (Priorität P1, Aufwand L,
   Abhängigkeiten „keine", Status DRAFT → im Verlauf auf DONE setzen).
3. **Commit:**
   ```
   docs: record plan 005 completion in README and plans index
   ```

---

## Verifikations-Checkliste (nach dem letzten Schnitt)

- [ ] `pnpm build && pnpm typecheck && pnpm lint && pnpm test` — alles grün.
- [ ] `pnpm specifyr editor <repo-mit-soll>` — TopBar zeigt Perspektive + Vergleich.
- [ ] Umschalten auf `SOLL ↔ IST` färbt Delta-Nodes korrekt (Sichtprüfung).
- [ ] `SOLL ↔ PLAN` mit leerem PLAN zeigt alle SOLL-Nodes als `removed`.
- [ ] `<html data-theme="light">` per Devtools → alle Rollen-Farben wechseln,
      Delta-Farben bleiben (bewusst konstant über beide Themes).
- [ ] Keine Vorkommen von `nodeTypeClasses` mehr im Repo (`grep -r nodeTypeClasses .`).
- [ ] `.specifyr/plan/` fehlt im Repo → `GET /api/plan` liefert leeres Modell, keinen 500er.

## Offene Fragen (nach Abschluss besprechen)

- **Editier-Slice für PLAN.** Braucht es einen POST-Endpoint und ein YAML-Editor-Modal, oder wollen wir PLAN vorerst nur per Hand pflegen?
- **Signature-Level `changed`.** Die grobe Feld-Vergleichsheuristik reicht für v1. Später: pro-Attribut-Diff sichtbar im Sidebar.
- **Theme-Persistenz.** `data-theme` bleibt Runtime; sinnvoll wäre `localStorage` und ein System-Preference-Fallback. Nicht in diesem Plan.
- **Rollen-Zuordnung IST.** Alle IST-Symbol-Typen fallen aktuell pauschal auf `frontend`. Sobald wir zwischen Backend-/Frontend-Modulen unterscheiden können (z. B. per Pfad-Heuristik oder `role:`-Frontmatter im YAML), lohnt ein feineres Mapping.
