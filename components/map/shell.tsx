"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  buildModel,
  buildView,
  clampOffset,
  offsetToShow,
  type Hover,
  type MapEdge,
  type MapFile,
  type Selection,
} from "@/lib/map/view";
import { Canvas } from "./canvas";
import { Pane, type RepoInfo, type Tab } from "./pane";

// Map and pane share one selection, one hover and one tab, so the state
// lives here. Everything is derived in the browser: selecting, hovering and
// scrolling never fetch.
export function MapShell({
  rail,
  files,
  edges,
  repo,
}: {
  rail: ReactNode;
  files: MapFile[];
  edges: MapEdge[];
  repo: RepoInfo;
}) {
  const model = useMemo(() => buildModel(files, edges), [files, edges]);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [offsets, setOffsets] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [selection, setSelection] = useState<Selection>(null);
  // Every handler that swaps what's under the pointer (open, close, select,
  // scroll) clears this: the element that set it may be gone without ever
  // receiving mouseleave.
  const [hover, setHover] = useState<Hover>(null);
  const [tab, setTab] = useState<Tab>("structure");
  const view = useMemo(() => buildView(model, open, offsets), [model, open, offsets]);
  // Scrolling a panel never changes sizes or node-to-node edges, so layout
  // runs off a view without offsets and is untouched by scrolling.
  const layoutView = useMemo(() => buildView(model, open), [model, open]);

  const openFolder = useCallback((dir: string) => {
    setOpen((prev) => new Set(prev).add(dir));
    setSelection({ kind: "folder", dir });
    setHover(null);
  }, []);

  const closeFolder = useCallback(
    (dir: string) => {
      setOpen((prev) => {
        const next = new Set(prev);
        next.delete(dir);
        return next;
      });
      setOffsets((prev) => {
        const next = new Map(prev);
        next.delete(dir);
        return next;
      });
      setSelection((s) => {
        if (s?.kind === "folder" && s.dir === dir) return null;
        if (s?.kind === "file" && model.folderOf.get(s.path) === dir) return null;
        return s;
      });
      setHover(null);
    },
    [model],
  );

  const selectFile = useCallback((path: string) => {
    setSelection({ kind: "file", path });
    setHover(null);
  }, []);

  // From the pane: the file may be inside a folded folder or scrolled out of
  // its panel, so open the folder and scroll the row into view.
  const revealFile = useCallback(
    (path: string) => {
      const dir = model.folderOf.get(path);
      if (dir === undefined) return;
      setOpen((prev) => (prev.has(dir) ? prev : new Set(prev).add(dir)));
      // Already on screen: leave the panel where the user scrolled it.
      const visible = view.nodes.find((n) => n.id === dir)?.rows.some((r) => r.path === path) ?? false;
      if (!visible) setOffsets((prev) => new Map(prev).set(dir, offsetToShow(model, path)));
      setSelection({ kind: "file", path });
      setHover(null);
    },
    [model, view],
  );

  // The panel scrolls natively; this only hears about it when the first
  // visible row changes, so the view (and edge endpoints) update per row,
  // not per pixel.
  const setFolderOffset = useCallback(
    (dir: string, offset: number) => {
      const total = model.folders.find((f) => f.dir === dir)?.files.length ?? 0;
      const next = clampOffset(offset, total);
      setOffsets((prev) => ((prev.get(dir) ?? 0) === next ? prev : new Map(prev).set(dir, next)));
      // Rows move under a pointer that may not have, so a row's hover can be
      // stale; the browser re-reports hover on the next pointer move.
      setHover(null);
    },
    [model],
  );

  const clearSelection = useCallback(() => {
    setSelection(null);
    setHover(null);
  }, []);

  return (
    <div className="grid h-full grid-cols-[13rem_minmax(0,1fr)_20rem]">
      {rail}
      <Canvas
        model={model}
        view={view}
        layoutView={layoutView}
        open={open}
        selection={selection}
        hover={hover}
        onOpen={openFolder}
        onClose={closeFolder}
        onSelectFile={selectFile}
        onClearSelection={clearSelection}
        onHover={setHover}
        onScroll={setFolderOffset}
      />
      <Pane
        model={model}
        repo={repo}
        selection={selection}
        hover={hover}
        tab={tab}
        onTab={setTab}
        onSelectFile={revealFile}
        onHover={setHover}
      />
    </div>
  );
}
