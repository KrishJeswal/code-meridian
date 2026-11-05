"use client";

import "@xyflow/react/dist/base.css";
import {
  ReactFlow,
  ReactFlowProvider,
  getViewportForBounds,
  useReactFlow,
  useStore,
  type Edge,
  type NodeTypes,
  type Viewport,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { layout, type Placed } from "@/lib/map/layout";
import { buildModel, buildView, focusOf, type MapEdge, type MapFile, type Selection } from "@/lib/map/view";
import { FolderNode, PanelNode, type FolderFlowNode, type PanelFlowNode } from "./nodes";

const nodeTypes: NodeTypes = { folder: FolderNode, panel: PanelNode };

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
const PADDING = 0.06;
const INITIAL_MAX_ZOOM = 1;

function boundsOf(placed: ReadonlyMap<string, Placed>) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of placed.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.width);
    maxY = Math.max(maxY, p.y + p.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function fitsOnScreen(
  b: { x: number; y: number; width: number; height: number },
  v: Viewport,
  width: number,
  height: number,
): boolean {
  const left = b.x * v.zoom + v.x;
  const top = b.y * v.zoom + v.y;
  return left >= 0 && top >= 0 && left + b.width * v.zoom <= width && top + b.height * v.zoom <= height;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function MapCanvas({ files, edges }: { files: MapFile[]; edges: MapEdge[] }) {
  const model = useMemo(() => buildModel(files, edges), [files, edges]);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [selection, setSelection] = useState<Selection>(null);
  const view = useMemo(() => buildView(model, open), [model, open]);
  const placed = useMemo(() => layout(view), [view]);
  const focus = useMemo(() => focusOf(model, view, selection), [model, view, selection]);

  const rf = useReactFlow();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const change = useRef<"open" | "close" | null>(null);
  // True until the user pans or zooms. While true, the view follows the
  // layout; after that, the view is theirs and only an open may change it.
  const autoFramed = useRef(true);
  const lastSize = useRef<{ width: number; height: number } | null>(null);
  const gestureStart = useRef<Viewport | null>(null);

  const onOpen = useCallback((dir: string) => {
    change.current = "open";
    setOpen((prev) => new Set(prev).add(dir));
    setSelection({ kind: "folder", dir });
  }, []);

  const onClose = useCallback(
    (dir: string) => {
      change.current = "close";
      setOpen((prev) => {
        const next = new Set(prev);
        next.delete(dir);
        return next;
      });
      setSelection((s) => {
        if (s?.kind === "folder" && s.dir === dir) return null;
        if (s?.kind === "file" && model.folderOf.get(s.path) === dir) return null;
        return s;
      });
    },
    [model],
  );

  const onSelectFile = useCallback((path: string) => setSelection({ kind: "file", path }), []);

  // Runs against the layout after the change has been applied, never the one
  // before it. Framing uses the same bounds, padding and zoom cap as the
  // initial fitView, so opening then closing a folder lands on exactly the
  // starting view instead of wherever the open's recentring left it.
  useEffect(() => {
    if (width === 0 || height === 0) return;
    const kind = change.current;
    change.current = null;
    const first = lastSize.current === null;
    const resized = !first && (lastSize.current?.width !== width || lastSize.current?.height !== height);
    lastSize.current = { width, height };
    if (first || (kind === null && !resized)) return;

    const current = rf.getViewport();
    const bounds = boundsOf(placed);
    let ceiling: number;
    if (autoFramed.current) {
      // Opening may only zoom out; closing and resizing may return to 1.
      ceiling = kind === "open" ? Math.min(current.zoom, INITIAL_MAX_ZOOM) : INITIAL_MAX_ZOOM;
    } else if (kind === "open" && !fitsOnScreen(bounds, current, width, height)) {
      ceiling = current.zoom;
      autoFramed.current = true;
    } else {
      return;
    }
    const next = getViewportForBounds(bounds, width, height, MIN_ZOOM, ceiling, PADDING);
    void rf.setViewport(next, { duration: kind && !prefersReducedMotion() ? 200 : 0 });
  }, [placed, rf, width, height]);

  const nodes = useMemo(
    () =>
      view.nodes.map((n): FolderFlowNode | PanelFlowNode => {
        const p = placed.get(n.id);
        if (!p) throw new Error(`layout has no position for ${n.id}`);
        return {
          id: n.id,
          type: n.open ? "panel" : "folder",
          position: { x: p.x, y: p.y },
          width: p.width,
          height: p.height,
          draggable: false,
          selectable: false,
          focusable: false,
          data: { node: n, focus, selection, onOpen, onClose, onSelectFile },
        };
      }),
    [view, placed, focus, selection, onOpen, onClose, onSelectFile],
  );

  const flowEdges = useMemo(
    () =>
      view.edges.map((e): Edge => {
        const dir = focus?.direction.get(e.id);
        const stroke = dir === "in" ? "var(--incoming)" : dir === "out" ? "var(--outgoing)" : "var(--border-strong)";
        return {
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle,
          target: e.target,
          targetHandle: e.targetHandle,
          selectable: false,
          focusable: false,
          style: { stroke, strokeWidth: dir ? 1.5 : 1, opacity: focus && !dir ? 0.12 : 1 },
        };
      }),
    [view, focus],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: PADDING, maxZoom: INITIAL_MAX_ZOOM }}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      zoomOnDoubleClick={false}
      // Programmatic moves (our own framing) arrive with no event. A plain
      // click also starts a pan gesture, so only a gesture that actually
      // moved the view counts as the user taking it over.
      onMoveStart={(event, viewport) => {
        gestureStart.current = event ? viewport : null;
      }}
      onMoveEnd={(event, viewport) => {
        const s = gestureStart.current;
        gestureStart.current = null;
        if (event && s && (s.x !== viewport.x || s.y !== viewport.y || s.zoom !== viewport.zoom)) {
          autoFramed.current = false;
        }
      }}
      onPaneClick={() => setSelection(null)}
      onNodeClick={(_, node) => {
        if (node.type === "folder") onOpen(node.id);
      }}
    />
  );
}

export function Canvas(props: { files: MapFile[]; edges: MapEdge[] }) {
  return (
    <div className="relative min-w-0 bg-surface">
      <ReactFlowProvider>
        <MapCanvas {...props} />
      </ReactFlowProvider>
    </div>
  );
}
