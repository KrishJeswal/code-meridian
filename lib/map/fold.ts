// Folding decides which directories are nodes on the map. Every directory
// starts as a node; deepest first, a directory holding fewer than
// `threshold` files hands them to its parent. The threshold rises until the
// node count is readable, and the lowest threshold that gets there wins, so
// the repository's own shape decides the depth.

export const MAX_NODES = 24;
export const START_THRESHOLD = 2;

export interface Folder {
  dir: string;
  files: string[];
}

export interface Fold {
  threshold: number;
  folders: Folder[];
}

export interface FoldInput {
  path: string;
  module: string;
}

function parentOf(dir: string): string {
  const i = dir.lastIndexOf("/");
  return i === -1 ? "." : dir.slice(0, i);
}

function depthOf(dir: string): number {
  return dir === "." ? 0 : dir.split("/").length;
}

function ancestors(dir: string): string[] {
  const out: string[] = [];
  for (let d = dir; d !== "."; d = parentOf(d)) out.push(d);
  out.push(".");
  return out;
}

export function foldAt(files: readonly FoldInput[], threshold: number): Folder[] {
  const held = new Map<string, string[]>();
  for (const f of files) {
    for (const a of ancestors(f.module)) if (!held.has(a)) held.set(a, []);
    held.get(f.module)?.push(f.path);
  }

  const byDepth = new Map<number, string[]>();
  for (const dir of held.keys()) {
    const d = depthOf(dir);
    byDepth.set(d, [...(byDepth.get(d) ?? []), dir]);
  }
  const depths = [...byDepth.keys()].sort((a, b) => b - a);

  for (const depth of depths) {
    if (depth === 0) break;
    // Decide every merge at this depth from one snapshot before applying any,
    // so no sibling's merge changes what another sibling sees.
    const merging = (byDepth.get(depth) ?? []).filter(
      (dir) => (held.get(dir)?.length ?? 0) < threshold,
    );
    for (const dir of merging) {
      const parent = held.get(parentOf(dir));
      parent?.push(...(held.get(dir) ?? []));
      held.delete(dir);
    }
  }

  return [...held.entries()]
    .filter(([, f]) => f.length > 0)
    .map(([dir, f]) => ({ dir, files: [...f].sort() }))
    .sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

export function fold(files: readonly FoldInput[], maxNodes = MAX_NODES): Fold {
  for (let threshold = START_THRESHOLD; ; threshold++) {
    const folders = foldAt(files, threshold);
    if (folders.length <= maxNodes || threshold > files.length) return { threshold, folders };
  }
}
