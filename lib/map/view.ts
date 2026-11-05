import { fold } from "./fold";
import { shortestUniqueLabels } from "./labels";

// Derived from the parser's output, never a reshaping of it: these are the
// fields the map and pane read, picked off ParseResult.files and .edges.
export interface MapFile {
  path: string;
  module: string;
  fanIn: number;
  fanOut: number;
  role: string | null;
  lines: number | null;
  parsed: boolean;
  skipReason: string | null;
}

export interface MapEdge {
  source: string;
  target: string;
  typeOnly: boolean;
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

// A panel never grows past MAX_ROWS rows. Past that it shows a window of
// WINDOW file rows between an "above" and a "below" row, so its size is the
// same wherever it is scrolled to.
export const MAX_ROWS = 12;
export const WINDOW = MAX_ROWS - 2;
export const ABOVE = "above";
export const BELOW = "below";

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
  // Every file in the panel, in order. All of them are in the DOM so the
  // list can scroll natively; `rows` is the subset that counts as on screen
  // (and that edges may attach to), from the first row at `offset`.
  allRows: Row[];
  rows: Row[];
  scrolls: boolean;
  offset: number;
  above: number;
  below: number;
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

// Most-depended-on files first, so the top of a panel is what matters most
// to the map; ties fall back to path for a stable order.
export function orderRows(paths: readonly string[], files: Map<string, MapFile>): string[] {
  return [...paths].sort((a, b) => {
    const d = (files.get(b)?.fanIn ?? 0) - (files.get(a)?.fanIn ?? 0);
    return d !== 0 ? d : a < b ? -1 : a > b ? 1 : 0;
  });
}

export function clampOffset(offset: number, total: number): number {
  return total <= MAX_ROWS ? 0 : Math.max(0, Math.min(offset, total - WINDOW));
}

// The offset that brings `path` into its panel's window, roughly centred.
export function offsetToShow(model: MapModel, path: string): number {
  const dir = model.folderOf.get(path);
  const folder = model.folders.find((f) => f.dir === dir);
  if (!folder) return 0;
  const index = orderRows(folder.files, model.files).indexOf(path);
  return clampOffset(index - Math.floor(WINDOW / 2), folder.files.length);
}

interface Window {
  ordered: string[];
  shown: Set<string>;
  offset: number;
}

function windowOf(folder: FolderSummary, files: Map<string, MapFile>, offset: number): Window {
  const ordered = orderRows(folder.files, files);
  if (ordered.length <= MAX_ROWS) return { ordered, shown: new Set(ordered), offset: 0 };
  const o = clampOffset(offset, ordered.length);
  return { ordered, shown: new Set(ordered.slice(o, o + WINDOW)), offset: o };
}

// Where a file attaches on screen: the folded node itself, its row in an
// open panel, or the panel's "above"/"below" row when scrolled out of view.
function endpoint(path: string, model: MapModel, windows: ReadonlyMap<string, Window>): { node: string; handle: string } {
  const dir = model.folderOf.get(path);
  if (dir === undefined) throw new Error(`${path} has no folder`);
  const w = windows.get(dir);
  if (!w) return { node: dir, handle: dir };
  if (w.shown.has(path)) return { node: dir, handle: path };
  return { node: dir, handle: w.ordered.indexOf(path) < w.offset ? ABOVE : BELOW };
}

export function handleKey(node: string, handle: string): string {
  return handle === ABOVE || handle === BELOW ? `${node}#${handle}` : handle;
}

export function buildView(
  model: MapModel,
  open: ReadonlySet<string>,
  offsets: ReadonlyMap<string, number> = new Map(),
): View {
  const windows = new Map<string, Window>();
  for (const folder of model.folders) {
    if (open.has(folder.dir)) windows.set(folder.dir, windowOf(folder, model.files, offsets.get(folder.dir) ?? 0));
  }

  // Labels cover every file in an open panel, shown or not, so scrolling
  // never changes a label and therefore never changes the layout.
  const labels = shortestUniqueLabels([
    ...model.folders.map((f) => f.dir),
    ...[...windows.values()].flatMap((w) => w.ordered),
  ]);
  const labelOf = (p: string): string => labels.get(p) ?? p;

  const nodes: ViewNode[] = model.folders.map((folder) => {
    const label = folder.dir === "." ? "./" : labelOf(folder.dir);
    const w = windows.get(folder.dir);
    if (!w) {
      return { id: folder.dir, label, folder, open: false, allRows: [], rows: [], scrolls: false, offset: 0, above: 0, below: 0 };
    }
    const allRows = w.ordered.map((p) => {
      const file = model.files.get(p);
      return { path: p, label: labelOf(p), fanIn: file?.fanIn ?? 0, fanOut: file?.fanOut ?? 0 };
    });
    const rows = allRows.filter((r) => w.shown.has(r.path));
    const scrolls = w.ordered.length > MAX_ROWS;
    return {
      id: folder.dir,
      label,
      folder,
      open: true,
      allRows,
      rows,
      scrolls,
      offset: w.offset,
      above: scrolls ? w.offset : 0,
      below: scrolls ? w.ordered.length - w.offset - rows.length : 0,
    };
  });

  const byKey = new Map<string, ViewEdge>();
  for (const e of model.edges) {
    const s = endpoint(e.source, model, windows);
    const t = endpoint(e.target, model, windows);
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
export type Hover = Selection;

export interface Focus {
  // Handle keys (a folded node's dir, a row's path, "<dir>#above|below") at
  // full strength.
  active: Set<string>;
  direction: Map<string, "in" | "out">;
}

// Whether a node shows at full strength under a focus: a folded node by its
// own key, a panel if any of its rows (or its above/below rows) is active.
export function nodeActive(focus: Focus, node: ViewNode): boolean {
  if (!node.open) return focus.active.has(node.id);
  return (
    node.rows.some((r) => focus.active.has(r.path)) ||
    focus.active.has(handleKey(node.id, ABOVE)) ||
    focus.active.has(handleKey(node.id, BELOW))
  );
}

export function viewWindows(model: MapModel, view: View): Map<string, Window> {
  const windows = new Map<string, Window>();
  for (const n of view.nodes) {
    if (n.open) windows.set(n.id, { ordered: orderRows(n.folder.files, model.files), shown: new Set(n.rows.map((r) => r.path)), offset: n.offset });
  }
  return windows;
}

// The on-screen key a file currently attaches to.
export function keyOf(model: MapModel, windows: ReadonlyMap<string, Window>, path: string): string {
  const e = endpoint(path, model, windows);
  return handleKey(e.node, e.handle);
}

export function focusOf(model: MapModel, view: View, selection: Selection): Focus | null {
  if (!selection) return null;
  const selected = new Set(
    selection.kind === "file"
      ? [selection.path]
      : (model.folders.find((f) => f.dir === selection.dir)?.files ?? []),
  );
  const windows = viewWindows(model, view);
  const key = (p: string): string => keyOf(model, windows, p);

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
