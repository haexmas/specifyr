// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, nextTick } from "vue";
import {
  REPO_PATH_STORAGE_KEY,
  clearStoredRepoPath,
  readStoredRepoPath,
  useRepoPath,
  writeStoredRepoPath,
} from "../../frontend/composables/use-repo-path.js";

interface DomGlobals {
  localStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    clear(): void;
  };
  document: {
    createElement(tag: string): { appendChild?: unknown };
    body: { appendChild(el: unknown): void };
  };
  // biome-ignore lint/suspicious/noExplicitAny: happy-dom's Storage prototype shape is not typed here.
  Storage: { prototype: any };
}
const dom = globalThis as unknown as DomGlobals;

/**
 * Mount `useRepoPath` inside a throwaway component so `onMounted` fires and
 * the composable's contract can be exercised end-to-end.
 */
async function mountComposable(): Promise<ReturnType<typeof useRepoPath>> {
  let captured: ReturnType<typeof useRepoPath> | undefined;
  const app = createApp(
    defineComponent({
      setup() {
        captured = useRepoPath();
        return () => null;
      },
    }),
  );
  const container = dom.document.createElement("div");
  dom.document.body.appendChild(container);
  // biome-ignore lint/suspicious/noExplicitAny: happy-dom Element is not in root tsconfig's lib.
  app.mount(container as any);
  await nextTick();
  if (!captured) throw new Error("composable did not mount");
  return captured;
}

describe("useRepoPath storage helpers", () => {
  beforeEach(() => {
    dom.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    dom.localStorage.clear();
  });

  it("read returns undefined when nothing is stored", () => {
    expect(readStoredRepoPath()).toBeUndefined();
  });

  it("read returns the previously stored value", () => {
    dom.localStorage.setItem(REPO_PATH_STORAGE_KEY, "/foo/bar");
    expect(readStoredRepoPath()).toBe("/foo/bar");
  });

  it("write persists the path and can be read back", () => {
    writeStoredRepoPath("/tmp/repo");
    expect(dom.localStorage.getItem(REPO_PATH_STORAGE_KEY)).toBe("/tmp/repo");
    expect(readStoredRepoPath()).toBe("/tmp/repo");
  });

  it("clear removes the stored path", () => {
    dom.localStorage.setItem(REPO_PATH_STORAGE_KEY, "/foo/bar");
    clearStoredRepoPath();
    expect(readStoredRepoPath()).toBeUndefined();
  });

  it("read swallows exceptions from getItem", () => {
    vi.spyOn(dom.Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => readStoredRepoPath()).not.toThrow();
    expect(readStoredRepoPath()).toBeUndefined();
  });

  it("write swallows exceptions from setItem", () => {
    vi.spyOn(dom.Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => writeStoredRepoPath("/foo")).not.toThrow();
  });

  it("clear swallows exceptions from removeItem", () => {
    vi.spyOn(dom.Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => clearStoredRepoPath()).not.toThrow();
  });
});

describe("useRepoPath", () => {
  beforeEach(() => {
    dom.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    dom.localStorage.clear();
  });

  it("hydrates repoPath from localStorage on mount and flips isReady", async () => {
    dom.localStorage.setItem(REPO_PATH_STORAGE_KEY, "/hydrated");
    const { repoPath, isReady } = await mountComposable();
    expect(repoPath.value).toBe("/hydrated");
    expect(isReady.value).toBe(true);
  });

  it("leaves repoPath undefined when nothing is stored", async () => {
    const { repoPath, isReady } = await mountComposable();
    expect(repoPath.value).toBeUndefined();
    expect(isReady.value).toBe(true);
  });

  it("setRepoPath writes to localStorage and updates the ref", async () => {
    const { repoPath, setRepoPath } = await mountComposable();
    setRepoPath("/new/repo");
    expect(repoPath.value).toBe("/new/repo");
    expect(dom.localStorage.getItem(REPO_PATH_STORAGE_KEY)).toBe("/new/repo");
  });

  it("clearRepoPath removes from localStorage and clears the ref", async () => {
    dom.localStorage.setItem(REPO_PATH_STORAGE_KEY, "/foo");
    const { repoPath, clearRepoPath } = await mountComposable();
    clearRepoPath();
    expect(repoPath.value).toBeUndefined();
    expect(dom.localStorage.getItem(REPO_PATH_STORAGE_KEY)).toBeNull();
  });

  it("survives a throwing localStorage without setting repoPath", async () => {
    vi.spyOn(dom.Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { repoPath, isReady } = await mountComposable();
    expect(repoPath.value).toBeUndefined();
    expect(isReady.value).toBe(true);
  });
});
