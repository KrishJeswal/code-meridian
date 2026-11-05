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
import { useEffect, useMemo, useRef } from "react";
import { layout, type Placed } from "@/lib/map/layout";
import { focusOf, keyOf, nodeActive, viewWindows, type Hover, type MapModel, type Selection, type View } from "@/lib/map/view";
import { FolderNode, PanelNode, type FolderFlowNode, type PanelFlowNode } from "./nodes";

const nodeTypes: NodeTypes = { folder: FolderNode, panel: PanelNode };

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
const PADDING = 0.06;
const INITIAL_MAX_ZOOM = 1;

// Bottom to top. Plain edges always sit under every node.
const Z_EDGE = 0;
const Z_DIMMED_NODE = 1;
const Z_HIGHLIGHTED_EDGE = 2;
const Z_NODE = 3;

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

export interface CanvasProps {
  model: MapModel;
  view: View;
  layoutView: View;
  open: ReadonlySet<string>;
  selection: Selection;
  hover: Hover;
  onOpen: (dir: string) => void;
  onClose: (dir: string) => void;
  onSelectFile: (path: string) => void;
  onClearSelection: () => void;
  onHover: (hover: Hover) => void;
  onScroll: (dir: string, offset: number) => void;
}

function MapCanvas(props: CanvasProps) {
  const { model, view, layoutView, open, selection, hover, onOpen, onClose, onSelectFile, onClearSelection, onHover, onScroll } = props;
  const placed = useMemo(() => layout(layoutView), [layoutView]);
  const focus = useMemo(() => focusOf(model, view, selection), [model, view, selection]);
  const windows = useMemo(() => viewWindows(model, view), [model, view]);
  const hoverKey = hover === null ? null : hover.kind === "folder" ? hover.dir : keyOf(model, windows, hover.path);

  const rf = useReactFlow();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  // True until the user pans or zooms. While true, the view follows the
  // layout; after that, the view is theirs and only an open may change it.
  const autoFramed = useRef(true);
  const lastSize = useRef<{ width: number; height: number } | null>(null);
  const lastOpen = useRef(open);
  const gestureStart = useRef<Viewport | null>(null);

  // Runs against the layout after the change has been applied, never the one
  // before it. Whether a folder opened or closed is read off the open set
  // itself, so an open from the pane is treated exactly like one from a
  // click. Framing uses the same bounds, padding and zoom cap as the initial
  // fitView, so opening then closing a folder lands on the starting view.
  useEffect(() => {
    if (width === 0 || height === 0) return;
    const kind = open.size > lastOpen.current.size ? "open" : open.size < lastOpen.current.size ? "close" : null;
    lastOpen.current = open;
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
  }, [placed, open, rf, width, height]);

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
          // Layering by relevance: dimmed nodes under highlighted edges, so a
          // coloured edge crossing an unrelated folder isn't darkened by its
          // translucent box; active nodes above them, so edges still run
          // under the rows they connect to.
          zIndex: focus && !nodeActive(focus, n) ? Z_DIMMED_NODE : Z_NODE,
          data: { node: n, focus, selection, hoverKey, onOpen, onClose, onSelectFile, onHover, onScroll },
        };
      }),
    [view, placed, focus, selection, hoverKey, onOpen, onClose, onSelectFile, onHover, onScroll],
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
          zIndex: dir ? Z_HIGHLIGHTED_EDGE : Z_EDGE,
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
      onPaneClick={onClearSelection}
      onNodeClick={(_, node) => {
        if (node.type === "folder") onOpen(node.id);
      }}
      onNodeMouseEnter={(_, node) => {
        if (node.type === "folder") onHover({ kind: "folder", dir: node.id });
      }}
      onNodeMouseLeave={(_, node) => {
        if (node.type === "folder") onHover(null);
      }}
    />
  );
}

export function Canvas(props: CanvasProps) {
  return (
    <div className="relative min-w-0 bg-surface">
      <ReactFlowProvider>
        <MapCanvas {...props} />
      </ReactFlowProvider>
    </div>
  );
}
