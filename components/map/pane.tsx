"use client";

import { useMemo, type ReactNode } from "react";
import {
  UNCLASSIFIED,
  fileDetail,
  folderDetail,
  repoSummary,
  type Neighbour,
  type Ranked,
} from "@/lib/map/summary";
import type { Hover, MapModel, Selection } from "@/lib/map/view";

export type Tab = "structure" | "explanation";

export interface RepoInfo {
  name: string;
  adapter: string;
  importsTotal: number;
  importsResolved: number;
}

const fmt = (n: number): string => n.toLocaleString("en-US");
const nFiles = (n: number): string => `${fmt(n)} ${n === 1 ? "file" : "files"}`;

interface PaneProps {
  model: MapModel;
  repo: RepoInfo;
  selection: Selection;
  hover: Hover;
  tab: Tab;
  onTab: (tab: Tab) => void;
  onSelectFile: (path: string) => void;
  onHover: (hover: Hover) => void;
}

export function Pane(props: PaneProps) {
  const { tab, onTab } = props;
  return (
    <aside aria-label="Details" className="flex min-h-0 flex-col border-l border-border bg-surface-raised">
      <div role="tablist" aria-label="Detail view" className="flex h-9 shrink-0 items-end gap-4 border-b border-border px-3">
        {(["structure", "explanation"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => onTab(t)}
            className={`-mb-px h-8 border-b-2 text-xs ${
              tab === t ? "border-accent font-medium text-text" : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {t === "structure" ? "Structure" : "Explanation"}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
        {tab === "structure" ? <Structure {...props} /> : <Explanation selection={props.selection} />}
      </div>
    </aside>
  );
}

function Explanation({ selection }: { selection: Selection }) {
  return (
    <p className="px-3 py-4 text-text-muted">
      {selection === null
        ? "Explanations aren't generated yet."
        : `No explanation for this ${selection.kind} yet. Explanations aren't generated in this version.`}
    </p>
  );
}

function Structure(props: PaneProps) {
  const { selection } = props;
  if (selection?.kind === "file") return <FileView {...props} path={selection.path} />;
  if (selection?.kind === "folder") return <FolderView {...props} dir={selection.dir} />;
  return <RepoView {...props} />;
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-3 py-3">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-text-muted">{k}</dt>
          <dd className="min-w-0">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, count, children }: { title: string; count?: string; children: ReactNode }) {
  return (
    <section className="border-t border-border py-2">
      <h3 className="flex items-baseline justify-between px-3 pb-1 text-[11px] text-text-muted">
        <span>{title}</span>
        {count ? <span className="font-mono">{count}</span> : null}
      </h3>
      {children}
    </section>
  );
}

function isHighlighted(model: MapModel, hover: Hover, path: string): boolean {
  if (hover === null) return false;
  if (hover.kind === "file") return hover.path === path;
  return model.folderOf.get(path) === hover.dir;
}

function PathList({
  items,
  props,
  empty,
}: {
  items: { path: string; right?: string; note?: string }[];
  props: PaneProps;
  empty: string;
}) {
  if (items.length === 0) return <p className="px-3 py-1 text-text-faint">{empty}</p>;
  return (
    <ul>
      {items.map((item) => {
        const slash = item.path.lastIndexOf("/");
        const dir = slash === -1 ? "" : item.path.slice(0, slash + 1);
        const name = item.path.slice(slash + 1);
        const lit = isHighlighted(props.model, props.hover, item.path);
        return (
          <li key={item.path}>
            <button
              type="button"
              onClick={() => props.onSelectFile(item.path)}
              onMouseEnter={() => props.onHover({ kind: "file", path: item.path })}
              onMouseLeave={() => props.onHover(null)}
              title={item.path}
              className={`flex h-6 w-full items-center gap-2 px-3 text-left font-mono text-xs ${
                lit ? "bg-accent/10" : "hover:bg-surface-sunken"
              }`}
            >
              {/* The directory gives way before the file name does. */}
              <span className="flex min-w-0 flex-1">
                <span className="min-w-0 truncate text-text-muted">{dir}</span>
                <span className="max-w-full shrink-0 truncate">{name}</span>
              </span>
              {item.note ? <span className="text-[11px] text-text-faint">{item.note}</span> : null}
              {item.right ? <span className="text-[11px] text-text-muted">{item.right}</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function rankedItems(list: Ranked[], unit: string) {
  return list.map((r) => ({ path: r.path, right: `${fmt(r.count)} ${unit}` }));
}

function RepoView(props: PaneProps) {
  const { model, repo } = props;
  const files = useMemo(() => [...model.files.values()], [model]);
  const s = useMemo(() => repoSummary(files), [files]);
  return (
    <>
      <h2 className="px-3 pt-3 font-mono text-[15px] font-semibold tracking-[-0.01em]">{repo.name}</h2>
      <Facts
        rows={[
          ["Framework", repo.adapter === "none" ? "None detected" : repo.adapter],
          ["Files", fmt(files.length)],
          ["Imports", `${fmt(repo.importsTotal)}, ${fmt(repo.importsResolved)} to repository files`],
          ["Routes", <span key="r" className="text-text-muted">Not detected: no framework adapter</span>],
          ["Unidentified", `${nFiles(s.unclassified)} no convention could identify`],
        ]}
      />
      <Section title="Most imported" count={`${s.mostImported.length} of ${fmt(s.importedCount)}`}>
        <PathList items={rankedItems(s.mostImported, "in")} props={props} empty="Nothing in this repository imports another file." />
      </Section>
      <Section title="Imported by nothing: start reading here" count={`${s.unimported.length} of ${fmt(s.unimportedCount)}`}>
        <PathList items={rankedItems(s.unimported, "out")} props={props} empty="Every parsed file is imported by another." />
      </Section>
    </>
  );
}

function neighbourItems(list: Neighbour[]) {
  return list.map((n) => ({ path: n.path, note: n.typeOnly ? "type" : undefined }));
}

function FileView(props: PaneProps & { path: string }) {
  const detail = useMemo(() => fileDetail(props.model, props.path), [props.model, props.path]);
  if (!detail) return <p className="px-3 py-4 text-text-muted">This file isn&apos;t in the analysis.</p>;
  const { file, imports, importedBy } = detail;
  return (
    <>
      <h2 className="px-3 pt-3 font-mono text-xs font-medium break-all">{file.path}</h2>
      <Facts
        rows={[
          ["Kind", file.role ?? UNCLASSIFIED],
          ["Length", file.lines === null ? "Not text" : `${fmt(file.lines)} lines`],
          ...(file.parsed ? [] : [["Parsed", `No: ${file.skipReason ?? "skipped"}`] as [string, ReactNode]]),
          ["Imports", nFiles(imports.length)],
          ["Imported by", nFiles(importedBy.length)],
        ]}
      />
      <Section title="Imports" count={fmt(imports.length)}>
        <PathList items={neighbourItems(imports)} props={props} empty="Imports no files in this repository." />
      </Section>
      <Section title="Imported by" count={fmt(importedBy.length)}>
        <PathList items={neighbourItems(importedBy)} props={props} empty="Nothing in this repository imports it." />
      </Section>
    </>
  );
}

function FolderView(props: PaneProps & { dir: string }) {
  const detail = useMemo(() => folderDetail(props.model, props.dir), [props.model, props.dir]);
  if (!detail) return <p className="px-3 py-4 text-text-muted">This folder isn&apos;t on the map.</p>;
  return (
    <>
      <h2 className="px-3 pt-3 font-mono text-xs font-medium break-all">{detail.dir === "." ? "./" : `${detail.dir}/`}</h2>
      <Facts
        rows={[
          ["Files", fmt(detail.fileCount)],
          ["Imported by", `${nFiles(detail.fanIn)} outside it`],
          ["Imports", `${nFiles(detail.fanOut)} outside it`],
        ]}
      />
      <Section title="Kinds of file">
        <ul>
          {detail.kinds.map((k) => (
            <li key={k.kind} className="flex h-6 items-center gap-2 px-3">
              <span aria-hidden className="size-2 shrink-0 rounded-[2px] bg-text-faint" />
              <span className="flex-1">{k.kind}</span>
              <span className="font-mono text-xs text-text-muted">{fmt(k.count)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
