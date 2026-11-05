import type { MapEdge, MapFile, MapModel } from "./view";

export const UNCLASSIFIED = "Unclassified";
export const TOP = 10;

export interface Ranked {
  path: string;
  count: number;
}

export interface RepoSummary {
  mostImported: Ranked[];
  importedCount: number;
  unimported: Ranked[];
  unimportedCount: number;
  unclassified: number;
}

function byCountThenPath(a: Ranked, b: Ranked): number {
  return b.count - a.count || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

// Where reading starts: parsed files nothing in the repository imports,
// biggest roots first. Skipped files are left out because nothing was read
// from them, so "imports nothing and imported by nothing" would be a guess.
export function repoSummary(files: readonly MapFile[]): RepoSummary {
  const imported = files.filter((f) => f.fanIn > 0).map((f) => ({ path: f.path, count: f.fanIn }));
  const unimported = files
    .filter((f) => f.parsed && f.fanIn === 0)
    .map((f) => ({ path: f.path, count: f.fanOut }));
  return {
    mostImported: imported.sort(byCountThenPath).slice(0, TOP),
    importedCount: imported.length,
    unimported: unimported.sort(byCountThenPath).slice(0, TOP),
    unimportedCount: unimported.length,
    unclassified: files.filter((f) => f.role === null).length,
  };
}

export interface Neighbour {
  path: string;
  typeOnly: boolean;
}

export interface FileDetail {
  file: MapFile;
  imports: Neighbour[];
  importedBy: Neighbour[];
}

function byPath(a: Neighbour, b: Neighbour): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

// The lists come from the same deduplicated edge list as fan-in and fan-out,
// so a count shown above a list always equals the rows under it.
export function fileDetail(model: MapModel, path: string): FileDetail | null {
  const file = model.files.get(path);
  if (!file) return null;
  const imports: Neighbour[] = [];
  const importedBy: Neighbour[] = [];
  for (const e of model.edges) {
    if (e.source === path) imports.push({ path: e.target, typeOnly: e.typeOnly });
    if (e.target === path) importedBy.push({ path: e.source, typeOnly: e.typeOnly });
  }
  return { file, imports: imports.sort(byPath), importedBy: importedBy.sort(byPath) };
}

export interface FolderDetail {
  dir: string;
  fileCount: number;
  fanIn: number;
  fanOut: number;
  kinds: { kind: string; count: number }[];
}

export function folderDetail(model: MapModel, dir: string): FolderDetail | null {
  const folder = model.folders.find((f) => f.dir === dir);
  if (!folder) return null;
  const counts = new Map<string, number>();
  for (const p of folder.files) {
    const kind = model.files.get(p)?.role ?? UNCLASSIFIED;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return {
    dir,
    fileCount: folder.files.length,
    fanIn: folder.fanIn,
    fanOut: folder.fanOut,
    kinds: [...counts.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count || (a.kind < b.kind ? -1 : 1)),
  };
}

export type { MapEdge, MapFile };
