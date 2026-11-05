import type { MapFile } from "@/lib/map/view";

const UNCLASSIFIED = "Unclassified";

// Categories are the parser's file roles as they stand. With no adapter
// labelling anything yet, that is honestly one row.
export function Rail({ files }: { files: MapFile[] }) {
  const counts = new Map<string, number>();
  for (const f of files) {
    const k = f.role ?? UNCLASSIFIED;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));

  return (
    <nav aria-label="File categories" className="flex flex-col border-r border-border bg-surface-raised">
      <h2 className="px-3 pt-3 pb-1.5 text-[11px] text-text-muted">File roles</h2>
      <ul className="flex flex-col">
        {rows.map(([name, count]) => (
          <li key={name} className="flex h-7 items-center gap-2 px-3">
            <span aria-hidden className="size-2 shrink-0 rounded-[2px] bg-text-faint" />
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <span className="font-mono text-xs text-text-muted">{count}</span>
          </li>
        ))}
      </ul>
    </nav>
  );
}
