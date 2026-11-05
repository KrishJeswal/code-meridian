import { fold } from "./fold";
import { shortestUniqueLabels } from "./labels";

// Derived from the parser's output, never a reshaping of it: these are the
// fields the map reads, picked off ParseResult.files and ParseResult.edges.
export interface MapFile {
  path: string;
  module: string;
  fanIn: number;
  fanOut: number;
  role: string | null;
}

export interface MapEdge {
  source: string;
  target: string;
}

export interface FolderSummary {
  dir: string;
  files: string[];
  // Distinct files outside the folder on the other end of an edge.
  fanIn: number;
  fanOut: number;
}

export interface MapModel {
  threshold: number;
  folders: FolderSummary[];
  folderOf: Map<string, string>;
  files: Map<string, MapFile>;
  edges: MapEdge[];
}

export const MAX_ROWS = 12;
export const MORE = "more";

export function buildModel(files: readonly MapFile[], edges: readonly MapEdge[]): MapModel {
  const f = fold(files);
  const folderOf = new Map<string, string>();
  for (const folder of f.folders) for (const p of folder.files) folderOf.set(p, folder.dir);

  const ins = new Map<string, Set<string>>();
  const outs = new Map<string, Set<string>>();
  for (const e of edges) {
    const s = folderOf.get(e.source);
    const t = folderOf.get(e.target);
    if (s === undefined || t === undefined) throw new Error(`edge ${e.source} -> ${e.target} names a file with no folder`);
    if (s === t) continue;
    if (!outs.has(s)) outs.set(s, new Set());
    if (!ins.has(t)) ins.set(t, new Set());
    outs.get(s)?.add(e.target);
    ins.get(t)?.add(e.source);
  }

  return {
    threshold: f.threshold,
    folders: f.folders.map((folder) => ({
      dir: folder.dir,
      files: folder.files,
      fanIn: ins.get(folder.dir)?.size ?? 0,
      fanOut: outs.get(folder.dir)?.size ?? 0,
    })),
    folderOf,
    files: new Map(files.map((file) => [file.path, file])),
    edges: [...edges],
  };
}

export interface Row {
  path: string;
  label: string;
  fanIn: number;
  fanOut: number;
}

export interface ViewNode {
  id: string;
  label: string;
  folder: FolderSummary;
  open: boolean;
  rows: Row[];
  hidden: number;
}

export interface ViewEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  count: number;
  pairs: [string, string][];
}

export interface View {
  nodes: ViewNode[];
  edges: ViewEdge[];
}

// Most-depended-on files first, so the rows that fit are the ones that matter
// to the map; ties fall back to path for a stable order.
function orderRows(paths: readonly string[], files: Map<string, MapFile>): string[] {
  return [...paths].sort((a, b) => {
    const d = (files.get(b)?.fanIn ?? 0) - (files.get(a)?.fanIn ?? 0);
    return d !== 0 ? d : a < b ? -1 : a > b ? 1 : 0;
  });
}

export function visibleRows(folder: FolderSummary, files: Map<string, MapFile>): { shown: string[]; hidden: number } {
  const ordered = orderRows(folder.files, files);
  if (ordered.length <= MAX_ROWS) return { shown: ordered, hidden: 0 };
  const shown = ordered.slice(0, MAX_ROWS - 1);
  return { shown, hidden: ordered.length - shown.length };
}

// Where a file attaches on screen: the folded node itself, its row in an
// open panel, or the panel's "more" row when it didn't fit.
export function endpointOf(
  path: string,
  model: MapModel,
  open: ReadonlySet<string>,
  shownRows: ReadonlyMap<string, ReadonlySet<string>>,
): { node: string; handle: string } {
  const dir = model.folderOf.get(path);
  if (dir === undefined) throw new Error(`${path} has no folder`);
  if (!open.has(dir)) return { node: dir, handle: dir };
  return { node: dir, handle: shownRows.get(dir)?.has(path) ? path : MORE };
}

export function buildView(model: MapModel, open: ReadonlySet<string>): View {
  const shownRows = new Map<string, Set<string>>();
  const nodes: ViewNode[] = model.folders.map((folder) => {
    if (!open.has(folder.dir)) return { id: folder.dir, label: "", folder, open: false, rows: [], hidden: 0 };
    const { shown, hidden } = visibleRows(folder, model.files);
    shownRows.set(folder.dir, new Set(shown));
    const rows = shown.map((p) => {
      const file = model.files.get(p);
      return { path: p, label: "", fanIn: file?.fanIn ?? 0, fanOut: file?.fanOut ?? 0 };
    });
    return { id: folder.dir, label: "", folder, open: true, rows, hidden };
  });

  const labels = shortestUniqueLabels([
    ...nodes.map((n) => n.id),
    ...nodes.flatMap((n) => n.rows.map((r) => r.path)),
  ]);
  for (const n of nodes) {
    n.label = n.id === "." ? "./" : (labels.get(n.id) ?? n.id);
    for (const r of n.rows) r.label = labels.get(r.path) ?? r.path;
  }

  const byKey = new Map<string, ViewEdge>();
  for (const e of model.edges) {
    const s = endpointOf(e.source, model, open, shownRows);
    const t = endpointOf(e.target, model, open, shownRows);
    // Edges inside one folder aren't drawn; the folder is the unit here.
    if (s.node === t.node) continue;
    const id = `${s.node}#${s.handle}->${t.node}#${t.handle}`;
    const existing = byKey.get(id);
    if (existing) {
      existing.count++;
      existing.pairs.push([e.source, e.target]);
    } else {
      byKey.set(id, {
        id,
        source: s.node,
        sourceHandle: `s:${s.handle}`,
        target: t.node,
        targetHandle: `t:${t.handle}`,
        count: 1,
        pairs: [[e.source, e.target]],
      });
    }
  }
  const edges = [...byKey.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { nodes, edges };
}

export type Selection = { kind: "folder"; dir: string } | { kind: "file"; path: string } | null;

export interface Focus {
  // Handles (a folded node's dir, a row's path, or "<dir>#more") at full strength.
  active: Set<string>;
  direction: Map<string, "in" | "out">;
}

export function handleKey(node: string, handle: string): string {
  return handle === MORE ? `${node}#${MORE}` : handle;
}

export function focusOf(model: MapModel, view: View, selection: Selection): Focus | null {
  if (!selection) return null;
  const selected = new Set(
    selection.kind === "file"
      ? [selection.path]
      : (model.folders.find((f) => f.dir === selection.dir)?.files ?? []),
  );
  const open = new Set(view.nodes.filter((n) => n.open).map((n) => n.id));
  const shownRows = new Map(view.nodes.map((n) => [n.id, new Set(n.rows.map((r) => r.path))]));
  const key = (p: string): string => {
    const e = endpointOf(p, model, open, shownRows);
    return handleKey(e.node, e.handle);
  };

  const active = new Set<string>();
  for (const p of selected) active.add(key(p));
  for (const e of model.edges) {
    const s = selected.has(e.source);
    const t = selected.has(e.target);
    if (s && !t) active.add(key(e.target));
    if (t && !s) active.add(key(e.source));
  }

  const direction = new Map<string, "in" | "out">();
  for (const edge of view.edges) {
    for (const [s, t] of edge.pairs) {
      if (selected.has(s) && !selected.has(t)) direction.set(edge.id, "out");
      else if (selected.has(t) && !selected.has(s)) direction.set(edge.id, "in");
    }
  }
  return { active, direction };
}
