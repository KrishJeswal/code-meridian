import type { EdgeRecord, ImportKind } from "./contract";

export interface ResolvedImport {
  source: string;
  target: string;
  kind: ImportKind;
  typeOnly: boolean;
}

// One edge per (source, target) pair, however many statements connect them.
// The edge is type-only only if every statement behind it is.
export function dedupeEdges(imports: readonly ResolvedImport[]): EdgeRecord[] {
  const byPair = new Map<string, EdgeRecord>();
  for (const i of imports) {
    const k = `${i.source}\u0000${i.target}`;
    const existing = byPair.get(k);
    if (!existing) {
      byPair.set(k, { source: i.source, target: i.target, kinds: [i.kind], typeOnly: i.typeOnly });
    } else {
      if (!existing.kinds.includes(i.kind)) existing.kinds.push(i.kind);
      existing.typeOnly &&= i.typeOnly;
    }
  }
  return [...byPair.values()].sort((a, b) =>
    a.source === b.source ? cmp(a.target, b.target) : cmp(a.source, b.source),
  );
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface Fan {
  fanIn: number;
  fanOut: number;
}

export function fanCounts(
  paths: readonly string[],
  edges: readonly EdgeRecord[],
): Map<string, Fan> {
  const fans = new Map<string, Fan>(paths.map((p) => [p, { fanIn: 0, fanOut: 0 }]));
  for (const e of edges) {
    const s = fans.get(e.source);
    const t = fans.get(e.target);
    if (!s || !t) throw new Error(`edge ${e.source} -> ${e.target} names a file not in the list`);
    s.fanOut++;
    t.fanIn++;
  }
  return fans;
}
