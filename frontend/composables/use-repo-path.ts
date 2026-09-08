import { type Ref, onMounted, ref } from "vue";

export const REPO_PATH_STORAGE_KEY = "specifyr:repoPath";

export interface UseRepoPathResult {
  repoPath: Ref<string | undefined>;
  setRepoPath: (path: string) => void;
  clearRepoPath: () => void;
  isReady: Ref<boolean>;
}

// Locally-declared shape for `localStorage`. The root tsconfig omits the DOM
// lib so that server code stays honest; this composable is client-only and
// only needs three methods off the Web Storage API.
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
function getStorage(): StorageLike | undefined {
  const g = globalThis as { localStorage?: StorageLike };
  return g.localStorage;
}

/**
 * Reactive access to the persisted repository path. Persists to
 * `localStorage[REPO_PATH_STORAGE_KEY]` and hydrates on mount so SSR / the
 * pre-mount tick can gate the picker on `isReady` instead of racing the
 * localStorage read.
 *
 * All localStorage calls are guarded and swallowed — private windows, quota
 * errors, or ITP-blocked access must not break the app.
 */
export function useRepoPath(): UseRepoPathResult {
  const repoPath = ref<string | undefined>(undefined);
  const isReady = ref(false);

  onMounted(() => {
    repoPath.value = readStoredRepoPath();
    isReady.value = true;
  });

  function setRepoPath(path: string): void {
    writeStoredRepoPath(path);
    repoPath.value = path;
  }

  function clearRepoPath(): void {
    clearStoredRepoPath();
    repoPath.value = undefined;
  }

  return { repoPath, setRepoPath, clearRepoPath, isReady };
}

/** Read the stored repo path; undefined if missing, cleared, or unavailable. */
export function readStoredRepoPath(): string | undefined {
  const storage = getStorage();
  if (!storage) return undefined;
  try {
    const value = storage.getItem(REPO_PATH_STORAGE_KEY);
    return value ?? undefined;
  } catch {
    return undefined;
  }
}

/** Persist the repo path; swallows quota / private-window errors. */
export function writeStoredRepoPath(path: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(REPO_PATH_STORAGE_KEY, path);
  } catch {
    // swallow: private windows, quota exhaustion, ITP restrictions
  }
}

/** Remove the stored repo path; swallows storage-access errors. */
export function clearStoredRepoPath(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(REPO_PATH_STORAGE_KEY);
  } catch {
    // swallow: same reasons as write
  }
}
