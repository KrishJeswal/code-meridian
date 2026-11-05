import dagre from "@dagrejs/dagre";
import { stronglyConnected } from "./scc";
import type { View, ViewNode } from "./view";

// Labels are monospace, so width is arithmetic rather than a DOM
// measurement, which keeps layout pure and identical on every run.
export const CHAR_WIDTH = 7.2;
export const ROW_HEIGHT = 22;
export const HEADER_HEIGHT = 40;
const PAD_X = 12;
const FAN_COLUMNS = 96;
const MIN_HEIGHT = 28;
const MAX_HEIGHT = 72;

// Height carries how much depends on a node. Square root so hubs stay
// distinguishable from each other without small folders all looking tall.
export function heightFor(fanIn: number): number {
  return Math.min(MAX_HEIGHT, MIN_HEIGHT + Math.round(4 * Math.sqrt(fanIn)));
}

function textWidth(s: string): number {
  return Math.ceil(s.length * CHAR_WIDTH);
}

export function sizeOf(node: ViewNode): { width: number; height: number } {
  if (!node.open) {
    return { width: textWidth(node.label) + 2 * PAD_X, height: heightFor(node.folder.fanIn) };
  }
  const rowsWidth = Math.max(0, ...node.rows.map((r) => textWidth(r.label))) + FAN_COLUMNS;
  const headerWidth = Math.max(textWidth(node.label), textWidth(`${node.folder.files.length} files  in 000  out 000`));
  const rowCount = node.rows.length + (node.hidden > 0 ? 1 : 0);
  return {
    width: Math.max(rowsWidth, headerWidth) + 2 * PAD_X,
    height: HEADER_HEIGHT + rowCount * ROW_HEIGHT + 4,
  };
}

export interface Placed {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Importers on the left, what they import on the right. Nodes and edges go
// in sorted, so dagre sees the same input and returns the same picture.
//
// Folders that import each other in a cycle are laid out from the condensed
// graph: edges inside a cycle are drawn but not given to dagre. Otherwise
// dagre breaks each cycle by stringing its members into a chain, one rank
// each, and a 24-node map came out 17 ranks wide.
export function layout(view: View): Map<string, Placed> {
  const g = new dagre.graphlib.Graph({ multigraph: false });
  g.setGraph({ rankdir: "LR", ranker: "longest-path", nodesep: 10, edgesep: 4, ranksep: 64, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));

  const sizes = new Map(view.nodes.map((n) => [n.id, sizeOf(n)]));
  const ids = [...sizes.keys()].sort();
  // dagre writes x, y and rank into the label object, so it gets a copy.
  for (const id of ids) g.setNode(id, { ...sizes.get(id) });
  const component = stronglyConnected(ids, view.edges);
  const pairs = new Map<string, number>();
  for (const e of view.edges) {
    if (component.get(e.source) === component.get(e.target)) continue;
    const k = `${e.source}\u0000${e.target}`;
    pairs.set(k, (pairs.get(k) ?? 0) + e.count);
  }
  for (const [k, weight] of [...pairs.entries()].sort()) {
    const [s, t] = k.split("\u0000");
    g.setEdge(s, t, { weight });
  }
  dagre.layout(g);

  // Dagre decides rank (left to right) and order within a rank; positions
  // are packed here. React Flow draws its own edges, so dagre's routing
  // isn't needed and positions are free to change.
  const byRank = new Map<number, { id: string; y: number }[]>();
  for (const id of ids) {
    const n = g.node(id);
    byRank.set(n.x, [...(byRank.get(n.x) ?? []), { id, y: n.y }]);
  }
  const ranks = [...byRank.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, members]) => members.sort((a, b) => a.y - b.y || (a.id < b.id ? -1 : 1)).map((m) => m.id));

  return pack(ranks, sizes);
}

const RANK_GAP = 110;
const SUB_COLUMN_GAP = 32;
const NODE_GAP = 14;
// Roughly the shape of the canvas column on a laptop or desktop screen.
const TARGET_ASPECT = 1.5;

type Size = { width: number; height: number };

// A rank too tall for the canvas wraps into side-by-side sub-columns, in
// dagre's order. The column-height cap is the one whose overall shape is
// closest to the canvas, so the map fills it instead of running off the
// bottom. Every candidate is tried in a fixed order, so the result is stable.
function pack(ranks: string[][], sizes: ReadonlyMap<string, Size>): Map<string, Placed> {
  const size = (id: string): Size => sizes.get(id) ?? { width: 0, height: 0 };
  const tallestNode = Math.max(...ranks.flat().map((id) => size(id).height));
  const tallestRank = Math.max(
    ...ranks.map((r) => r.reduce((h, id) => h + size(id).height, 0) + NODE_GAP * (r.length - 1)),
  );

  let best: { score: number; placed: Map<string, Placed> } | null = null;
  for (let cap = tallestNode; ; cap = Math.min(tallestRank, cap + 20)) {
    const placed = packWithCap(ranks, size, cap);
    const b = extent(placed);
    const score = Math.abs(Math.log(b.width / b.height / TARGET_ASPECT));
    if (!best || score < best.score) best = { score, placed };
    if (cap >= tallestRank) break;
  }
  return best?.placed ?? new Map();
}

function packWithCap(ranks: string[][], size: (id: string) => Size, cap: number): Map<string, Placed> {
  const out = new Map<string, Placed>();
  let x = 0;
  for (const rank of ranks) {
    const columns: string[][] = [[]];
    let used = 0;
    for (const id of rank) {
      const h = size(id).height;
      const column = columns[columns.length - 1];
      if (column.length > 0 && used + NODE_GAP + h > cap) {
        columns.push([id]);
        used = h;
      } else {
        column.push(id);
        used += (column.length > 1 ? NODE_GAP : 0) + h;
      }
    }
    for (const column of columns) {
      const width = Math.max(...column.map((id) => size(id).width));
      const height = column.reduce((h, id) => h + size(id).height, 0) + NODE_GAP * (column.length - 1);
      let y = -height / 2;
      for (const id of column) {
        const s = size(id);
        out.set(id, { id, x, y, width: s.width, height: s.height });
        y += s.height + NODE_GAP;
      }
      x += width + SUB_COLUMN_GAP;
    }
    x += RANK_GAP - SUB_COLUMN_GAP;
  }
  return out;
}

export function extent(placed: ReadonlyMap<string, Placed>): Size {
  const p = [...placed.values()];
  const minX = Math.min(...p.map((n) => n.x));
  const minY = Math.min(...p.map((n) => n.y));
  return {
    width: Math.max(...p.map((n) => n.x + n.width)) - minX,
    height: Math.max(...p.map((n) => n.y + n.height)) - minY,
  };
}
