# specifyr TS Rewrite — Slice Tailwind: introduce Tailwind CSS + per-node-type colors

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the plain `<style>` blocks in `frontend/pages/index.vue` with Tailwind CSS utility classes, and use Tailwind color utilities to give each SOLL and IST node type a distinct look.

**Architecture:** Tailwind 4 via its official `@tailwindcss/vite` plugin — no `@nuxtjs/tailwindcss` module wrapper. A single `frontend/assets/css/tailwind.css` imports Tailwind; `frontend/nuxt.config.ts` registers the Vite plugin and adds the CSS file to Nuxt's global css list. `frontend/pages/index.vue`'s existing plain-CSS layout blocks (`editor-shell`, `editor-topbar`, `editor-segmenter`, `editor-status`, `editor-layout-status`) become Tailwind utility strings on the elements. Node colors are driven by a small `NODE_TYPE_CLASSES: Record<string, string>` map in the script block, applied on the Vue Flow node's `class` field. Vue Flow's own `.vue-flow__node-default` styling gets overridden with Tailwind's `!` prefix inside a single global `<style>` block (short and unavoidable — Vue Flow injects the offending styles into the DOM outside our scoped scope).

**Tech Stack:** `tailwindcss@4.3.3` + `@tailwindcss/vite@4.3.3`. No `postcss.config`, no `tailwind.config.js` needed — Tailwind 4's zero-config path uses `@import "tailwindcss";` in a CSS file plus the Vite plugin. Existing Nuxt 4.3 + Vue 3.5 + Vue Flow 1.42 stack untouched.

**Reference:**
- Design doc §5 (Decision summary — `UI: shadcn-vue, Pinia with command-stack`) at [docs/plans/2026-09-06-specifyr-visual-architecture-editor-design.md](2026-09-06-specifyr-visual-architecture-editor-design.md). shadcn-vue is the eventual target — Tailwind is a prerequisite either way (shadcn-vue ships as tailwind components).
- Slice X: introduced the plain CSS being replaced. Palette for SOLL types (component=blue, module=green, external-service=amber, data-store=pink) is preserved verbatim on the Tailwind side.
- Slice A/B: added IST node types with no color. This slice gives them each one.
- Slice ELK just merged (main tip `ff3dc6f`): editor renders at http://127.0.0.1:3939 in dev; still uses plain-CSS colors.

**Branch:** `ts/slice-tailwind-and-colors` off current `main` (`ff3dc6f`). Main protected. Land via PR. Wait for CodeRabbit (memory: `CR before merge`).

**Non-goals for this slice:**
- shadcn-vue (target for a later slice when we need Dialog/Panel components — needs Pinia state around it too)
- Pinia state management (target for the editing slice)
- Design tokens / theme file (single-file utilities are simpler at this scale)
- Dark mode toggle
- Rewriting the SOLL palette (Slice X's choices stay — component=blue, module=green, external-service=amber, data-store=pink)
- Rewriting `frontend/app.vue` (empty shell, nothing to migrate)
- Making the editor UI responsive to mobile viewports
- Removing the `<style>` block entirely — one small global `<style>` remains for Vue Flow node overrides that can't be expressed on the element via `class` (Vue Flow paints its own DOM)

**Node-type color palette:**

| type | Tailwind bg | Tailwind border | slice |
|---|---|---|---|
| `component` | `bg-blue-100` | `border-blue-500` | SOLL — preserved from Slice X |
| `module` | `bg-green-100` | `border-green-500` | SOLL — preserved. Shared with IST module. |
| `external-service` | `bg-amber-100` | `border-amber-500` | SOLL — preserved from Slice X |
| `data-store` | `bg-pink-100` | `border-pink-500` | SOLL — preserved from Slice X |
| `class` | `bg-purple-100` | `border-purple-500` | IST — new |
| `interface` | `bg-indigo-100` | `border-indigo-500` | IST — new |
| `type-alias` | `bg-teal-100` | `border-teal-500` | IST — new |
| `enum` | `bg-orange-100` | `border-orange-500` | IST — new |
| `function` | `bg-red-100` | `border-red-500` | IST — new |

Unknown types fall back to Tailwind default (gray border, transparent bg) — matches the current default-gray behavior for unclassified IST nodes.

---

## Task 1: Create the working branch

**Files:** git ref `HEAD`.

**Step 1: Confirm clean main**
```bash
git status && git branch --show-current && git log --oneline -1
```
Expected: clean, on `main`, tip `ff3dc6f` or later. Any leftover `plans/` untracked dir from earlier user WIP is fine — it belongs to the user, do not touch.

**Step 2: Create branch**
```bash
git switch -c ts/slice-tailwind-and-colors
```

**Step 3: Commit plan**
```bash
git add docs/plans/2026-09-07-specifyr-ts-slice-tailwind-and-colors.md
git commit -m "Add Slice Tailwind plan: introduce Tailwind CSS + per-node-type colors"
```

---

## Task 2: Install Tailwind 4 as a frontend dep

**Files:** `frontend/package.json`, `pnpm-lock.yaml`.

**Step 1: Add deps**

Update `frontend/package.json` `dependencies`, alphabetical order:
```json
  "dependencies": {
    "@tailwindcss/vite": "4.3.3",
    "@vue-flow/background": "1.3.2",
    "@vue-flow/core": "1.42.0",
    "elkjs": "0.12.0",
    "specifyr": "workspace:*",
    "tailwindcss": "4.3.3"
  },
```
Exact pins. Both are pure JS — no native compilation. If either version is unavailable, use the newest 4.3.x and note in the commit body.

**Step 2: Install**
```bash
pnpm install
```
Expected: `+ @tailwindcss/vite`, `+ tailwindcss` under specifyr-frontend. No engine warnings.

**Step 3: Verify no unexpected transitives**
```bash
pnpm --filter specifyr-frontend list @tailwindcss/vite tailwindcss
```
Expected: both at 4.3.3, one location each.

**Step 4: Existing gates green**
```bash
pnpm typecheck && pnpm lint && pnpm test
```
All exit 0. Test count still 193.

**Step 5: Commit**
```
Add tailwindcss + @tailwindcss/vite as frontend deps
```

---

## Task 3: Wire Tailwind into Nuxt

**Files:**
- Create: `frontend/assets/css/tailwind.css`
- Modify: `frontend/nuxt.config.ts`

**Step 1: Create the CSS entry**

Create `frontend/assets/css/tailwind.css`:
```css
@import "tailwindcss";
```

That single line is the Tailwind 4 entry — no `@tailwind base/components/utilities` triple-import needed.

**Step 2: Register in nuxt.config.ts**

Current `frontend/nuxt.config.ts` (roughly):
```typescript
export default defineNuxtConfig({
  ssr: false,
  telemetry: false,
  devtools: { enabled: false },
  app: {
    head: {
      title: "specifyr editor",
      htmlAttrs: { lang: "en" },
    },
  },
});
```

Change to:
```typescript
import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  ssr: false,
  telemetry: false,
  devtools: { enabled: false },
  css: ["~/assets/css/tailwind.css"],
  vite: {
    plugins: [tailwindcss()],
  },
  app: {
    head: {
      title: "specifyr editor",
      htmlAttrs: { lang: "en" },
    },
  },
});
```

The `~/` prefix is Nuxt's alias for the project root (`frontend/` in our workspace).

**Step 3: Verify build**
```bash
pnpm --filter specifyr-frontend build
```
Expected: build succeeds. `.output/public/_nuxt/*.css` file gets bigger (contains Tailwind's used utilities). If build fails, check:
- Tailwind's Vite plugin needs Vite ≥5.0; Nuxt 4.3 ships Vite ≥7, fine.
- `~/` alias resolution — Nuxt should handle it, but if it errors, use the absolute path `./frontend/assets/css/tailwind.css` from the config file (which is inside `frontend/`, so `./assets/css/tailwind.css` also works).

**Step 4: Commit**
```
Wire Tailwind 4 into Nuxt via @tailwindcss/vite
```

---

## Task 4: `node-type-classes.ts` — node-type → Tailwind classes helper (TDD)

Pure map from Slice A/B/X node types to a Tailwind class string. Testable without Vue.

**Files:**
- Create: `frontend/composables/node-type-classes.ts`
- Create: `tests/frontend/node-type-classes.test.ts`

**Step 1: Failing tests**

Create `tests/frontend/node-type-classes.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import {
  nodeTypeClasses,
  NODE_TYPE_CLASSES,
} from "../../frontend/composables/node-type-classes.js";

describe("NODE_TYPE_CLASSES", () => {
  it("has a mapping for every SOLL top-level type from Slice X", () => {
    expect(NODE_TYPE_CLASSES.component).toBeDefined();
    expect(NODE_TYPE_CLASSES.module).toBeDefined();
    expect(NODE_TYPE_CLASSES["external-service"]).toBeDefined();
    expect(NODE_TYPE_CLASSES["data-store"]).toBeDefined();
  });

  it("has a mapping for every IST TypeScript pack type from Slice A", () => {
    expect(NODE_TYPE_CLASSES.class).toBeDefined();
    expect(NODE_TYPE_CLASSES.interface).toBeDefined();
    expect(NODE_TYPE_CLASSES["type-alias"]).toBeDefined();
    expect(NODE_TYPE_CLASSES.enum).toBeDefined();
    expect(NODE_TYPE_CLASSES.function).toBeDefined();
  });
});

describe("nodeTypeClasses", () => {
  it("returns the SOLL mapping for a known SOLL type", () => {
    expect(nodeTypeClasses("component")).toContain("bg-blue-100");
    expect(nodeTypeClasses("component")).toContain("border-blue-500");
  });

  it("returns the IST mapping for a known IST type", () => {
    expect(nodeTypeClasses("class")).toContain("bg-purple-100");
    expect(nodeTypeClasses("class")).toContain("border-purple-500");
  });

  it("falls back to a neutral class string for an unknown type", () => {
    const fallback = nodeTypeClasses("mystery-type");
    // Something neutral but not empty — border-gray-400 is our convention.
    expect(fallback).toContain("border-gray-400");
  });
});
```

**Step 2: Run to FAIL** — module not found.

**Step 3: Implement `frontend/composables/node-type-classes.ts`**

```typescript
// Map from IST/SOLL node type to a space-separated Tailwind utility class
// string. Kept small and static — no runtime lookups, no theme system yet.
// Applied on Vue Flow's node.class field in pages/index.vue.

export const NODE_TYPE_CLASSES: Record<string, string> = {
  // SOLL top-level (Slice X — hues preserved)
  component: "bg-blue-100 border-blue-500",
  module: "bg-green-100 border-green-500",
  "external-service": "bg-amber-100 border-amber-500",
  "data-store": "bg-pink-100 border-pink-500",
  // IST TypeScript pack types (Slice A)
  class: "bg-purple-100 border-purple-500",
  interface: "bg-indigo-100 border-indigo-500",
  "type-alias": "bg-teal-100 border-teal-500",
  enum: "bg-orange-100 border-orange-500",
  function: "bg-red-100 border-red-500",
};

const FALLBACK = "border-gray-400";

export function nodeTypeClasses(type: string): string {
  return NODE_TYPE_CLASSES[type] ?? FALLBACK;
}
```

**Step 4: Run PASS** — 5 tests.

**Step 5: Commit**
```
Add nodeTypeClasses helper mapping node types to Tailwind classes (TDD)
```

---

## Task 5: Rewrite `frontend/pages/index.vue` — plain CSS → Tailwind + typed colors

**Files:** Modify `frontend/pages/index.vue`.

**Step 1: Read the current file**

```bash
cat frontend/pages/index.vue
```

Note the shape — we're rewriting nearly all styling.

**Step 2: Update the script block**

Add import:
```typescript
import { nodeTypeClasses } from "../composables/node-type-classes.js";
```

Change the `flowNodes` `class` field from:
```typescript
    class: `soll-node soll-node--${node.type}`,
```
To:
```typescript
    class: `soll-node ${nodeTypeClasses(node.type)}`,
```

The `soll-node` marker class stays — it's the selector we use in the remaining global `<style>` block for Vue Flow-injected DOM overrides (step 5 below).

**Step 3: Rewrite the template — Tailwind utilities on elements**

Full replacement of the `<template>` block:
```vue
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
          class="cursor-pointer border-r border-zinc-300 bg-transparent px-3 py-1 font-inherit last:border-r-0"
          :class="view === 'soll' ? 'bg-zinc-200 font-semibold' : ''"
          @click="view = 'soll'"
        >
          SOLL
        </button>
        <button
          type="button"
          class="cursor-pointer border-r border-zinc-300 bg-transparent px-3 py-1 font-inherit last:border-r-0"
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
```

Notes on the mappings:
- `.editor-shell` → `flex h-screen flex-col font-sans`
- `.editor-topbar` → `flex items-center gap-2 border-b border-zinc-300 bg-zinc-100 px-4 py-2 text-sm`
- `.editor-segmenter` → `inline-flex overflow-hidden rounded-md border border-zinc-300`
- `.editor-segmenter button` → `cursor-pointer border-r border-zinc-300 bg-transparent px-3 py-1 font-inherit last:border-r-0`
- `.editor-segmenter button.is-active` → conditional `bg-zinc-200 font-semibold`
- `.editor-status` (loading/empty variants) → `flex flex-1 items-center justify-center text-zinc-500`
- `.editor-status--error` → `flex flex-1 items-center justify-center whitespace-pre-wrap text-red-600`
- `.editor-layout-status` → `italic text-zinc-500`
- `.editor-canvas` → `min-h-0 flex-1`

If Tailwind rejects `font-inherit` (it's a v3 utility that may have moved in v4), replace with an inline `style="font: inherit"` on the button — but try `font-inherit` first, Tailwind 4 kept most v3 utilities.

**Step 4: Replace the two `<style>` blocks with one small global block**

Delete both existing `<style scoped>` and `<style>` blocks. Replace with a single small global block for Vue Flow-injected node overrides:

```vue
<style>
/* Vue Flow injects .vue-flow__node-default into a DOM subtree that our scoped
   styles can't reach. Keep this small — only what Vue Flow's default theme
   overrides on our node element. */
.soll-node.vue-flow__node-default {
  @apply rounded-lg border p-2 text-center text-xs whitespace-pre-line;
  min-width: 140px;
}
</style>
```

The `@apply` directive in Tailwind 4 works inside `<style>` blocks when the file is processed through the Vite plugin. If `@apply` inside a Vue SFC `<style>` block doesn't work (Vite/Vue interaction can be finicky), fall back to pure CSS in that one block:
```css
.soll-node.vue-flow__node-default {
  border-radius: 0.5rem;
  border-width: 1px;
  padding: 0.5rem;
  text-align: center;
  font-size: 0.75rem;
  white-space: pre-line;
  min-width: 140px;
}
```
The per-type `bg-*` and `border-*-500` colors now come from the element's `class` attribute (via `nodeTypeClasses`), NOT from CSS selectors. So this block only carries type-agnostic shape.

**Step 5: Verify build**

```bash
pnpm --filter specifyr-frontend build
```
Expected: build succeeds. `_nuxt/*.css` file contains the utility subset used.

**Step 6: Commit**
```
Rewrite editor page styles from plain CSS to Tailwind utilities
```

---

## Task 6: Extend E2E test — assert Tailwind class is present in bundle

**Files:** Modify `tests/cli/editor-ist-integration.test.ts`.

Slice ELK's test already scans `_nuxt/*.js` for the substring "elkjs". Extend it to also assert that the CSS bundle references at least one Tailwind utility class — a regression that dropped the Vite plugin would silently ship the page unstyled.

**Step 1: Add the assertion**

After the existing ELK scan block, append:
```typescript
    // Tailwind sanity check: the CSS bundle should contain at least one of the
    // node-type utilities we mapped in nodeTypeClasses. A regression that
    // dropped @tailwindcss/vite would ship the page unstyled.
    const cssBundles = readdirSync(publicNuxt).filter((n) => n.endsWith(".css"));
    const anyMentionsTailwindColor = cssBundles.some((name) => {
      const content = readFileSync(resolve(publicNuxt, name), "utf8");
      return content.includes("bg-blue-100") || content.includes("bg-purple-100");
    });
    expect(anyMentionsTailwindColor).toBe(true);
```

**Step 2: Rebuild + rerun**

```bash
pnpm build
pnpm test tests/cli/editor-ist-integration.test.ts
```
Expected: 1 test passes, now with the extra CSS-bundle assertion.

**Step 3: Commit**
```
Assert Tailwind color utilities land in the CSS bundle (E2E)
```

---

## Task 7: README + PR

**Files:** Modify `README.md`.

**Step 1: Update the Status list**

Insert between Slice ELK and the planned section:
```markdown
Slice Tailwind (current): Tailwind CSS as the editor's styling primitive. Per-node-type colors for SOLL (component/module/external-service/data-store) and IST (class/interface/type-alias/enum/function). ✅
```

**Step 2: Update the editor usage note**

Append at the end of the "Click IST in the TopBar…" paragraph:
```markdown
Nodes are coloured by type: SOLL components stand out in blue, modules in
green, external services in amber, data stores in pink; IST classes in
purple, interfaces in indigo, type aliases in teal, enums in orange,
functions in red.
```

**Step 3: Full gate**

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```
All exit 0. Test count: 193 baseline + 5 (node-type-classes) = **198 tests**.

**Step 4: Commit**
```
Update README with Slice Tailwind status
```

**Step 5: Push**
```bash
git push -u origin ts/slice-tailwind-and-colors
```

**Step 6: Open PR**
```bash
gh pr create --base main --head ts/slice-tailwind-and-colors \
  --title "TS rewrite Slice Tailwind: introduce Tailwind CSS + per-node-type colors" \
  --body-file - <<'EOF'
## Summary

Introduces Tailwind CSS as the editor's styling primitive and adds per-node-type colors for both SOLL and IST node types. Plan tracked in
[docs/plans/2026-09-07-specifyr-ts-slice-tailwind-and-colors.md](docs/plans/2026-09-07-specifyr-ts-slice-tailwind-and-colors.md).

### What's in

- **`tailwindcss@4.3.3` + `@tailwindcss/vite@4.3.3`** as new frontend deps. No native compile. Nuxt integration via Vite plugin — no `@nuxtjs/tailwindcss` module wrapper.
- **`frontend/assets/css/tailwind.css`** — one-line `@import "tailwindcss";` entry.
- **`frontend/nuxt.config.ts`** — Vite plugin + `css: ["~/assets/css/tailwind.css"]`.
- **`frontend/composables/node-type-classes.ts`** — pure `NODE_TYPE_CLASSES` map + `nodeTypeClasses(type)` helper. Unit-tested (5 tests).
- **`frontend/pages/index.vue`** — plain-CSS layout blocks (editor-shell/topbar/segmenter/status/canvas) rewritten as Tailwind utility classes. Node color driven by `nodeTypeClasses` on Vue Flow's `class` field.
- **E2E test** now asserts the CSS bundle contains at least one of our Tailwind color utilities — regression guard against a dropped Vite plugin.

### Non-goals for this slice
- shadcn-vue (later slice when Dialog/Panel components are needed — requires Pinia state around it)
- Pinia (later slice with editing)
- Design tokens / theme file
- Dark mode toggle
- Rewriting the SOLL palette (Slice X hues preserved)
- Making the editor responsive to mobile viewports

### Node-type palette

| type | scheme |
|---|---|
| component | blue |
| module | green |
| external-service | amber |
| data-store | pink |
| class | purple |
| interface | indigo |
| type-alias | teal |
| enum | orange |
| function | red |

## Test plan

- [x] \`pnpm install --frozen-lockfile\` clean
- [x] \`pnpm build\` clean (Nuxt bundle includes Tailwind CSS)
- [x] \`pnpm lint\`, \`pnpm typecheck\` clean (root + frontend)
- [x] \`pnpm test\` — 198 tests pass (baseline 193 + 5 new nodeTypeClasses)
- [x] E2E test confirms Tailwind color utilities land in \`_nuxt/*.css\`

## Manual verification

    pnpm build
    node dist/cli/index.js editor . --no-open --port 3939
    # http://127.0.0.1:3939 → click IST → nodes now colored per type instead
    # of uniform gray. Modules green, classes purple, interfaces indigo, etc.

## Notes for reviewer

- Tailwind 4's Vite plugin path is preferred over the older `@nuxtjs/tailwindcss` module wrapper — cleaner, one fewer abstraction.
- Only one \`<style>\` block remains in \`pages/index.vue\`, for Vue Flow's node-shape override. Vue Flow paints its own DOM subtree that scoped classes can't reach; the block is small and type-agnostic (colors come from the element's class attribute).
- \`font-inherit\` is a Tailwind utility used in the segmenter buttons — if this is deprecated in Tailwind 4, the fallback is an inline \`style="font: inherit"\`. Verify on first render.
EOF
```

**Step 7: Wait for CodeRabbit before merging.**

---

## Notes for the executing agent

- **YAGNI:** no theme file, no design tokens, no dark mode toggle, no responsive breakpoints beyond what Tailwind's defaults give for free.
- **DRY:** the node-type-color mapping lives in one place — `node-type-classes.ts`. Do NOT duplicate the mapping inside `pages/index.vue`.
- **Preserve Slice X hues:** `component=blue, module=green, external-service=amber, data-store=pink` must not change — a Slice X reviewer picked those. Change palette in a separate follow-up if desired.
- **Tailwind 4 v3-utility compatibility:** most v3 utilities work unchanged. If any specific utility name has moved (e.g., `font-inherit`, `flex-1`, `pre-line`), consult the Tailwind 4 upgrade guide inline and replace as needed. Note deviations in commit bodies.
- **Vue Flow overrides:** the one remaining `<style>` block MUST use a CSS selector that matches Vue Flow's rendered DOM. Do NOT try to move node-shape (border-radius, padding, min-width) into element-level class attributes — Vue Flow re-renders its own wrapper and the class doesn't stick where you'd expect.
- **TDD:** Task 4 is strict test-first. All other tasks are wiring/config with build-verify gates.
- **Main protected**, work on `ts/slice-tailwind-and-colors`, land via PR, **CR before merge**.
