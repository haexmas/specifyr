# Slice Repo Picker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Users open the editor and pick which repository to analyze from a filesystem browser inside the browser — no CLI argument required. The picked path is stored per browser (localStorage) and drives IST/SOLL data via query params. The CLI's positional path becomes an optional default; the frontend picker overrides it.

**Architecture:** A new `/api/browse?path=…` endpoint returns the entries of a directory (subdirectories only, sorted). API routes `/api/ist` and `/api/soll` accept `?repoPath=…` and validate; they fall back to the process env for backwards compatibility with the current CLI-supplied path. A frontend composable `useRepoPath()` exposes a reactive current path synced with `localStorage['specifyr:repoPath']`. A modal picker starts at `os.homedir()` (server-supplied) and lets the user drill down, up, or select the current folder. On landing without a stored path, the modal opens automatically.

**Tech Stack:** Nuxt `defineEventHandler`, `node:fs/promises`, `node:path`, `node:os`, Vue 3 composable + `localStorage`, Tailwind for the modal.

**Non-goals:**
- Recent projects / bookmarks
- Multi-repo simultaneously
- Server-side file preview
- File-type filter
- Uploading / dragging a project into the browser
- Sandbox restrictions on which host paths can be browsed (this is a local dev tool bound to 127.0.0.1; the user is browsing their own filesystem)
- Auto-detect that a repo has `.specifyr/` and mark it as "initialized"
- Free-text path input (browsing is enough for v1)
- Keyboard navigation of the picker beyond native tab / enter
- Server-Sent-Event live rebrowse on filesystem changes

---

## Task 1: Branch + plan doc

**Files:**
- Create: `docs/plans/2026-09-08-specifyr-ts-slice-repo-picker.md` (this file)

```bash
git add docs/plans/2026-09-08-specifyr-ts-slice-repo-picker.md
git commit -m "Add Slice Repo Picker plan: in-browser folder picker"
```

---

## Task 2: `browseDirectory` helper (TDD)

**Files:**
- Create: `frontend/server/utils/browse.ts`
- Test: `tests/frontend/browse.test.ts`

**Contract:**

```typescript
export interface DirEntry {
  name: string;
  isDir: true; // reserved shape for a future "isDir" toggle; v1 lists dirs only
}

export interface BrowseResult {
  /** The absolute, symlink-resolved path that was listed. */
  path: string;
  /** Parent directory, or undefined if `path` is the filesystem root. */
  parent: string | undefined;
  /** Home directory, always provided so the UI can offer a "home" button. */
  home: string;
  entries: DirEntry[];
}

export async function browseDirectory(rawPath: string | undefined): Promise<BrowseResult>;
```

Rules:
- `rawPath` undefined / empty → default to `os.homedir()`.
- Resolve `rawPath` via `realpath` (canonicalizes symlinks; throws `ENOENT` if the path doesn't exist).
- If the resolved target is not a directory → throw `Error("not a directory: <path>")`.
- Read the directory with `readdir(path, { withFileTypes: true })`; keep only directories.
- Skip entries that start with `.` (hidden directories). This can be relaxed in a later slice; v1 keeps the picker tidy.
- Sort remaining entries by `name` using `localeCompare`, case-insensitive.
- Compute `parent`:
  - `dirname(path)` if it differs from `path` (filesystem root's `dirname` is itself);
  - otherwise `undefined`.
- Silently skip entries the process cannot stat (permission denied on the child, EACCES); do not throw the whole request.

**Tests (TDD — red first, then impl, then green). Use `mkdtempSync(tmpdir(), "specifyr-browse-")` for isolation; create subdirectories via `mkdirSync`.**

Cover:
- Default path is `os.homedir()` when `rawPath` is undefined
- Default path is `os.homedir()` when `rawPath` is `""`
- Lists only subdirectories, not files (create both, assert only dirs return)
- Hidden `.foo` directories are excluded
- Entries returned sorted case-insensitive by name (create `bDir`, `Adir`, `cdir`; expect `Adir, bDir, cdir`)
- `parent` is the parent path when listing a subdirectory
- `parent` is `undefined` at the filesystem root (assert `"/"` on posix)
- `home` field always echoes `os.homedir()`
- Missing path throws (ENOENT)
- Non-directory path (a file) throws with "not a directory"
- Symlinks resolve (create a dir `real`, symlink `link → real`; browsing `link/` returns the same result as `real/` with `.path` equal to `real`'s absolute path)

**Commit:**

```bash
git add frontend/server/utils/browse.ts tests/frontend/browse.test.ts
git commit -m "Add browseDirectory helper for the repo picker (TDD)"
```

---

## Task 3: `/api/browse` endpoint

**Files:**
- Create: `frontend/server/api/browse.get.ts`
- Test: `tests/frontend/browse-handler.test.ts`

**Endpoint contract:**

`GET /api/browse?path=<optional absolute path>` → `BrowseResult` JSON on 200, or `{error: string}` on 400/500.

- 400 for validation errors (`not a directory`, `ENOENT`) with the error message in the body.
- 500 for anything else.
- Query param `path` is read via `getQuery(event).path` and coerced to string / undefined.

**Handler shape:** mirror `frontend/server/api/soll.get.ts` — try/catch, `setResponseStatus`, return `{error}`.

**Tests:** call the handler function directly via `defineEventHandler` extraction similar to how `tests/frontend/soll-handler.test.ts` calls `loadSollForRequest`. Two tests: happy path returns entries; malformed path returns 400.

If handler-shim testing is awkward, keep coverage on `browseDirectory` (Task 2) and add a lightweight guarded call to the handler that only asserts the returned status via a synthetic `event` object.

**Commit:**

```bash
git add frontend/server/api/browse.get.ts tests/frontend/browse-handler.test.ts
git commit -m "Add /api/browse endpoint for the repo picker"
```

---

## Task 4: `?repoPath=` on `/api/ist` and `/api/soll`

**Files:**
- Modify: `frontend/server/utils/ist.ts`
- Modify: `frontend/server/utils/soll.ts`
- Modify: `frontend/server/api/ist.get.ts`
- Modify: `frontend/server/api/soll.get.ts`
- Modify: `tests/frontend/ist-handler.test.ts`
- Modify: `tests/frontend/soll-handler.test.ts`

**Refactor:**

Change `loadIstForRequest` and `loadSollForRequest` to accept an explicit repo path:

```typescript
export async function loadIstForRequest(repoPath: string): Promise<Model>;
export async function loadSollForRequest(repoPath: string): Promise<Model>;
```

Remove the `SPECIFYR_REPO_PATH`-lookup from the utils. Move the lookup logic (query → env fallback → error) into a shared helper used by both handlers:

```typescript
// frontend/server/utils/repo-path.ts
export function resolveRepoPath(query: { repoPath?: string | string[] } | undefined): string {
  const fromQuery = Array.isArray(query?.repoPath) ? query.repoPath[0] : query?.repoPath;
  const chosen = fromQuery?.trim() || process.env.SPECIFYR_REPO_PATH;
  if (!chosen) {
    throw new Error(
      "No repository path selected. Pass ?repoPath=<abs> or set SPECIFYR_REPO_PATH.",
    );
  }
  return chosen;
}
```

Handlers:

```typescript
// ist.get.ts
export default defineEventHandler(async (event) => {
  try {
    const repoPath = resolveRepoPath(getQuery(event));
    return await loadIstForRequest(repoPath);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    setResponseStatus(event, 500);
    return { error: message };
  }
});
```

Same shape for `soll.get.ts`. The ENOENT-to-empty-model behavior in `loadSollForRequest` (from PR #17) is preserved.

**Tests:**

- New: `tests/frontend/repo-path.test.ts` — `resolveRepoPath` covers: query wins over env; whitespace-only query falls through to env; both missing throws; array query picks first entry.
- Update existing `soll-handler.test.ts` / `ist-handler.test.ts` to call the new signatures (`loadIstForRequest(repoPath)` / `loadSollForRequest(repoPath)`). The "throws when SPECIFYR_REPO_PATH is not set" test moves to `resolveRepoPath` and gets renamed accordingly.

**Commit:**

```bash
git add frontend/server/utils frontend/server/api/ist.get.ts frontend/server/api/soll.get.ts tests/frontend
git commit -m "Accept ?repoPath= query on /api/ist and /api/soll, env fallback preserved"
```

---

## Task 5: Frontend picker + `useRepoPath` composable

**Files:**
- Create: `frontend/composables/use-repo-path.ts`
- Modify: `frontend/pages/index.vue`
- (Optional) Create: `frontend/components/RepoPicker.vue` — inline in `index.vue` is fine for v1; only extract if the template gets unwieldy.

### `useRepoPath()`

Returns `{repoPath, setRepoPath, clearRepoPath, isReady}`:

- `repoPath: Ref<string | undefined>` — the current selection.
- On mount: read `localStorage['specifyr:repoPath']`; set the ref.
- `setRepoPath(path)`: writes to `localStorage` and updates the ref.
- `clearRepoPath()`: removes the key and clears the ref.
- `isReady: Ref<boolean>` — flips to `true` once the mount hook has run, so SSR/first-tick code can wait before deciding whether to open the picker.

Wrap all `localStorage` calls in try/catch (private windows, quota, ITP restrictions).

### `pages/index.vue`

- Import and use `useRepoPath()`.
- Both `useFetch` calls become reactive on `repoPath.value`:
  ```typescript
  const endpoint = computed(() => {
    if (!repoPath.value) return null;
    const base = view.value === "soll" ? "/api/soll" : "/api/ist";
    return `${base}?repoPath=${encodeURIComponent(repoPath.value)}`;
  });
  const { data, error, status } = useFetch<Model>(endpoint, {
    watch: [view, repoPath],
    immediate: false,
  });
  watch(endpoint, (value) => {
    if (value) void (useFetch as any); // no-op; useFetch reacts via `watch` prop
  });
  ```
  (Use whichever `useFetch` reactivity pattern current Nuxt requires — the `endpoint` ref pattern already used in this file is the reference.)
- When `endpoint.value === null`, render the picker instead of the data views. Do NOT render "Loading…".
- Header gains a small text badge showing the current path (truncated, `title=` for full) and a "Change…" button that opens the picker modal.

### Picker modal (inline in `index.vue`)

- Dialog-style overlay: `<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40">…<div class="w-[560px] max-w-[90vw] rounded-lg bg-white p-4 shadow-xl">…</div></div>`.
- Fetch `/api/browse?path=<current>` reactively as the user drills; use `useFetch` with a `browsePath` ref (starts at `home` from the response).
- Header row: back-arrow (uses `parent`, disabled at root), current path (truncated), home button (`browsePath = home`).
- Body: list of `entries`, each a `<button>` that sets `browsePath = joinPath(current, name)`. If the list is empty, show "No subdirectories."
- Footer: "Cancel" (only shown when a repoPath is already set — the very first landing has nothing to cancel to), "Select this folder" primary button that calls `setRepoPath(browsePath)` then closes the modal.
- The picker's own path input is separate from `repoPath` — the user only commits their choice via the primary button.

**Verify:**

- `pnpm typecheck` clean
- `pnpm lint` clean
- Full `pnpm test` green
- Frontend build succeeds
- Manual smoke:
  - Cold start (no localStorage) → picker opens automatically
  - Drill down two levels, click "Select this folder" → modal closes, graph loads for that path
  - Reload page → same path is used, no picker
  - Click "Change…" → picker reopens starting at home
  - Cancel closes the modal without changing the path

**Commit:**

```bash
git add frontend/composables/use-repo-path.ts frontend/pages/index.vue
git commit -m "Add useRepoPath composable + inline folder picker modal"
```

---

## Task 6: Optional CLI `path` + startup smoke

**Files:**
- Modify: `src/cli/commands/index.ts` — make `path` positional argument optional.
- Modify: `src/cli/commands/editor.ts` — `EditorOptions.repoPath` becomes `repoPath: string | undefined`; if undefined, do NOT set `SPECIFYR_REPO_PATH` in the child env; adjust the "Editor running at" log line to omit the `(SOLL: <path>)` suffix when unset.
- Modify: any CLI tests that assert the positional-required behavior.

When the user runs `specifyr editor` with no argument:
- No env var → API returns "No repository path selected" (until frontend picker sets it).
- Frontend picker opens on landing (Task 5) and the user is prompted immediately.

When the user runs `specifyr editor <path>`:
- Existing behavior: env is set → API defaults to it → frontend receives a valid path on cold start → no picker on landing.
- The header "Change…" button still lets them switch mid-session.

**Verify:**

Startup smoke: `pnpm build`, then run `node dist/cli/index.js editor --port 3939 --no-open` (no path). Curl `/api/browse` and confirm 200; curl `/api/ist` without `?repoPath=` and confirm 500 with the "No repository path selected" message.

**Commit:**

```bash
git add src/cli
git commit -m "Make specifyr editor's path argument optional"
```

---

## Task 7: Code-review checkpoint

Dispatch `superpowers:code-reviewer` on commits from Task 2 to Task 6. Focus:

- **API contract**: `?repoPath=` validation — arrays, empty strings, whitespace, missing. `browseDirectory` — symlink handling, ENOENT vs non-dir distinction, hidden-dir exclusion consistency.
- **Layout stability contract still holds** — `useElkLayout.inputKey` untouched. Positions do NOT include repoPath. Switching repos re-fires `useFetch`, which re-fires ELK (correct — different data), but repositioning nodes is expected across repos.
- **localStorage safety** — try/catch around all reads/writes; SSR-safe (`process.client`/`import.meta.client` guards); does not run during server render.
- **Reactive `useFetch` on `endpoint`** — the existing pattern in `pages/index.vue` uses `useFetch<Model>(endpoint, {watch: [view]})` with `endpoint = computed`. Adding `repoPath` to the watch list should suffice; verify the request re-fires on both dependencies.
- **Picker modal focus trap** — Tab cycling inside the modal. If missing, note as optional polish, do not block.
- **Escape closes modal** — expected UX; add if trivial, else note as polish.
- **Backwards compat** — startup with a CLI path still works exactly as before; existing E2E test (`tests/cli/editor-ist-integration.test.ts`) must still pass unchanged.
- **The picker fetches `/api/browse` on every drill** — no cache, fine at this scale.

Apply approved suggestions before proceeding.

---

## Task 8: E2E bundle guard

**Files:**
- Modify: `tests/cli/editor-ist-integration.test.ts`

**Step:** Append a sibling assertion after the existing search guard:

```typescript
const anyMentionsPicker = bundles.some((name) => {
  const content = readFileSync(resolve(PUBLIC_NUXT, name), "utf8");
  return content.includes("Select this folder") && content.includes("/api/browse");
});
expect(anyMentionsPicker).toBe(true);
```

Run: `pnpm --filter specifyr-frontend build && pnpm test tests/cli/editor-ist-integration.test.ts`

If Vite minifies the `/api/browse` string, fall back to `content.includes("Select this folder") && content.includes("browse")`.

**Commit:**

```bash
git add tests/cli/editor-ist-integration.test.ts
git commit -m "Guard repo picker markers in bundle"
```

---

## Task 9: README + green + push + PR

**Files:**
- Modify: `README.md`

**Step 1:** Under `## Status`, add:

```
Slice Repo Picker (current): open the editor with or without a path — an in-browser folder picker lets you pick and swap repositories; selection persists per browser. ✅
```

Move the previous `(current)` off Slice Search.

Also update the Usage section: `specifyr editor` now shows both forms:
- `specifyr editor` — opens the picker on landing
- `specifyr editor <path>` — pre-selects the repo (still works)

**Step 2:** Green gate:

```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

**Step 3:** Commit + push + PR.

---

## Execution notes for the subagent chain

- Baseline (main tip `260dc5e`): 225 tests, 35 files, 91 Biome-checked files.
- Tasks 2-3 (browse helper + endpoint) can be one implementer subagent — they're tightly coupled.
- Task 4 (per-request repoPath refactor) is a small refactor across 4 handler files + 2 test files. One implementer subagent.
- Task 5 (frontend picker) is the biggest chunk. One implementer subagent; expect a code-review round after this alone.
- Task 6 (CLI) is small; batch with Task 5's subagent or do quickly by hand.
- Task 7 is the code-review checkpoint after Tasks 2-6.
- Tasks 8-9 wrap up.
- Do NOT restart the editor on port 3939 (user's live process; user restarts when ready).
- Do NOT push, do NOT open a PR until Task 9.
