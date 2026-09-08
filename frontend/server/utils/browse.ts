import { readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface DirEntry {
  name: string;
  isDir: true;
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

/**
 * Lists subdirectories of `rawPath` for the repo picker. Empty or undefined
 * `rawPath` falls back to `os.homedir()`. The returned `path` is symlink-
 * resolved. Only directories are returned; hidden entries (starting with `.`)
 * are skipped. Children the process cannot stat are silently omitted rather
 * than failing the whole request.
 */
export async function browseDirectory(rawPath: string | undefined): Promise<BrowseResult> {
  const home = homedir();
  const target = rawPath && rawPath.length > 0 ? rawPath : home;
  const resolved = await realpath(target);
  const info = await stat(resolved);
  if (!info.isDirectory()) {
    throw new Error(`not a directory: ${resolved}`);
  }

  const raw = await readdir(resolved, { withFileTypes: true });
  const checked = await Promise.all(
    raw.map(async (dirent) => {
      if (dirent.name.startsWith(".")) return undefined;
      // dirent.isDirectory() is fast but does not follow symlinks; a symlinked
      // subdir would be dropped. stat() the child so a link → dir is included.
      try {
        const childInfo = await stat(join(resolved, dirent.name));
        if (!childInfo.isDirectory()) return undefined;
        return { name: dirent.name, isDir: true } as DirEntry;
      } catch {
        // EACCES / dangling symlink / race — skip rather than fail the browse.
        return undefined;
      }
    }),
  );
  const entries = checked
    .filter((e): e is DirEntry => e !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const parentCandidate = dirname(resolved);
  const parent = parentCandidate === resolved ? undefined : parentCandidate;

  return { path: resolved, parent, home, entries };
}
