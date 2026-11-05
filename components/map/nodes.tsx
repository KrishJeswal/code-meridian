"use client";

import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { ROW_HEIGHT } from "@/lib/map/layout";
import {
  ABOVE,
  BELOW,
  WINDOW,
  handleKey,
  nodeActive,
  type Focus,
  type Hover,
  type Selection,
  type ViewNode,
} from "@/lib/map/view";

export type MapNodeData = {
  node: ViewNode;
  focus: Focus | null;
  selection: Selection;
  hoverKey: string | null;
  onOpen: (dir: string) => void;
  onClose: (dir: string) => void;
  onSelectFile: (path: string) => void;
  onHover: (hover: Hover) => void;
  onScroll: (dir: string, offset: number) => void;
};

export type FolderFlowNode = Node<MapNodeData, "folder">;
export type PanelFlowNode = Node<MapNodeData, "panel">;

// Handles are attachment points only; nothing is ever connected by hand.
const HIDDEN: CSSProperties = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0 };

function Ports({ id }: { id: string }) {
  return (
    <>
      <Handle type="target" position={Position.Left} id={`t:${id}`} isConnectable={false} style={HIDDEN} />
      <Handle type="source" position={Position.Right} id={`s:${id}`} isConnectable={false} style={HIDDEN} />
    </>
  );
}

function dimmed(focus: Focus | null, key: string): boolean {
  return focus !== null && !focus.active.has(key);
}

function fanText(fanIn: number, fanOut: number): string {
  return `in ${fanIn}  out ${fanOut}`;
}

function smooth(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

export function FolderNode({ data }: NodeProps<FolderFlowNode>) {
  const { node, focus, hoverKey } = data;
  const f = node.folder;
  const hovered = hoverKey === node.id;
  return (
    <div className={`relative h-full w-full ${dimmed(focus, node.id) ? "opacity-35" : ""}`}>
      <Ports id={node.id} />
      {/* Mouse clicks arrive through the flow's onNodeClick, which is also
          what makes React Flow let pointer events reach any node. */}
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            data.onOpen(node.id);
          }
        }}
        title={`${f.dir}  ${f.files.length} files  ${fanText(f.fanIn, f.fanOut)}`}
        className={`flex h-full w-full cursor-pointer items-center rounded-[4px] border bg-surface-raised px-3 font-mono text-xs whitespace-nowrap ${
          hovered ? "border-accent" : "border-border hover:border-border-strong"
        }`}
      >
        {node.label}
      </div>
    </div>
  );
}

function EdgeRow({
  nodeId,
  which,
  count,
  focus,
  hoverKey,
  onPage,
}: {
  nodeId: string;
  which: typeof ABOVE | typeof BELOW;
  count: number;
  focus: Focus | null;
  hoverKey: string | null;
  onPage: () => void;
}) {
  const key = handleKey(nodeId, which);
  return (
    <div className={`relative h-[22px] shrink-0 ${dimmed(focus, key) ? "opacity-35" : ""}`}>
      <Ports id={which} />
      <button
        type="button"
        tabIndex={-1}
        disabled={count === 0}
        onClick={onPage}
        className={`flex h-full w-full items-center px-3 text-left text-[11px] ${
          count === 0 ? "text-text-faint" : "text-text-muted hover:bg-surface-sunken hover:text-text"
        } ${hoverKey === key ? "bg-accent/10" : ""}`}
      >
        {count === 0 ? (which === ABOVE ? "Top of folder" : "End of folder") : `${count} more ${which}`}
      </button>
    </div>
  );
}

const STEP: Record<string, (current: number, last: number) => number> = {
  ArrowDown: (c, last) => (c < 0 ? 0 : Math.min(c + 1, last)),
  ArrowUp: (c) => (c < 0 ? 0 : Math.max(c - 1, 0)),
  PageDown: (c, last) => Math.min(Math.max(c, 0) + WINDOW, last),
  PageUp: (c) => Math.max(c - WINDOW, 0),
  Home: () => 0,
  End: (_, last) => last,
};

export function PanelNode({ id, data }: NodeProps<PanelFlowNode>) {
  const { node, focus, selection, hoverKey } = data;
  const f = node.folder;
  const folderSelected = selection?.kind === "folder" && selection.dir === node.id;
  const shown = new Set(node.rows.map((r) => r.path));
  // A row outside the on-screen set attaches (and dims) as the above/below
  // row does, because that's where its edges are drawn.
  const keyFor = (path: string, index: number): string =>
    shown.has(path) ? path : handleKey(node.id, index < node.offset ? ABOVE : BELOW);
  const anyActive = focus === null || nodeActive(focus, node);

  const updateNodeInternals = useUpdateNodeInternals();
  const list = useRef<HTMLUListElement>(null);
  const frame = useRef<number | null>(null);
  // The first row this panel last reported. An offset that differs came from
  // outside (the pane revealing a file) and is scrolled to; one that matches
  // came from the user's own scrolling and must not be fought.
  const reported = useRef(node.offset);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, node.offset, updateNodeInternals]);

  useEffect(() => {
    const el = list.current;
    if (!el || !node.scrolls || node.offset === reported.current) return;
    reported.current = node.offset;
    el.scrollTo({ top: node.offset * ROW_HEIGHT, behavior: smooth() });
  }, [node.offset, node.scrolls]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  // A panel that opens with its folder selected takes focus, so the arrow
  // keys work straight away. Mount only; later moves set focus themselves.
  const focusOnMount = useRef(folderSelected);
  useEffect(() => {
    if (focusOnMount.current) list.current?.focus({ preventScroll: true });
  }, []);

  // Native scrolling moves the handles every frame, and React Flow only
  // re-measures them when told to: once per frame at most. The view hears
  // about it only when the first visible row changes.
  const onListScroll = (): void => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      updateNodeInternals(id);
      const el = list.current;
      if (!el) return;
      const first = Math.round(el.scrollTop / ROW_HEIGHT);
      if (first !== reported.current) {
        reported.current = first;
        data.onScroll(node.id, first);
      }
    });
  };

  const page = (direction: 1 | -1): void => {
    list.current?.scrollBy({ top: direction * WINDOW * ROW_HEIGHT, behavior: smooth() });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>): void => {
    const step = STEP[e.key];
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    const order = node.allRows.map((r) => r.path);
    const current = selection?.kind === "file" ? order.indexOf(selection.path) : -1;
    const next = step(current, order.length - 1);
    const path = order[next];
    if (path === undefined) return;
    data.onSelectFile(path);
    const el = list.current;
    if (!el) return;
    // Scroll only as far as needed to keep the row inside the window.
    const top = next * ROW_HEIGHT;
    if (top < el.scrollTop) el.scrollTo({ top, behavior: smooth() });
    else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight)
      el.scrollTo({ top: top + ROW_HEIGHT - el.clientHeight, behavior: smooth() });
  };

  // The click that opens a folder can finish on the panel that replaces it,
  // landing on the header and closing it again. A mouse click only counts
  // here if its press started inside this panel; keyboard clicks (detail 0)
  // always count.
  const pressedInside = useRef(false);

  return (
    <div
      onPointerDownCapture={() => {
        pressedInside.current = true;
      }}
      onClickCapture={(e) => {
        if (e.detail !== 0 && !pressedInside.current) e.stopPropagation();
        pressedInside.current = false;
      }}
      className={`flex h-full w-full flex-col overflow-hidden rounded-[4px] border bg-surface-raised ${
        folderSelected || hoverKey === node.id ? "border-accent" : "border-border-strong"
      } ${anyActive ? "" : "opacity-35"}`}
    >
      <button
        type="button"
        onClick={() => data.onClose(node.id)}
        onMouseEnter={() => data.onHover({ kind: "folder", dir: node.id })}
        onMouseLeave={() => data.onHover(null)}
        title="Close folder"
        className="flex h-10 shrink-0 flex-col justify-center border-b border-border px-3 text-left hover:bg-surface-sunken"
      >
        <span className="font-mono text-xs font-medium whitespace-nowrap">{node.label}</span>
        <span className="font-mono text-[11px] whitespace-nowrap text-text-muted">
          {f.files.length} files  {fanText(f.fanIn, f.fanOut)}
        </span>
      </button>
      {node.scrolls ? (
        <EdgeRow nodeId={node.id} which={ABOVE} count={node.above} focus={focus} hoverKey={hoverKey} onPage={() => page(-1)} />
      ) : null}
      {/* Focus lives on the list, not the rows, so arrow keys work wherever
          the selection is; rows are reached by clicking or by keys. */}
      <ul
        ref={list}
        tabIndex={0}
        aria-label={`Files in ${f.dir}`}
        onKeyDown={onKeyDown}
        onScroll={node.scrolls ? onListScroll : undefined}
        // nowheel: the wheel scrolls this list instead of zooming the map.
        // The selected row already shows where the keys are; no focus ring.
        data-focus-ring="off"
        className={node.scrolls ? "nowheel overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-width:none]" : undefined}
        style={node.scrolls ? { height: WINDOW * ROW_HEIGHT } : undefined}
      >
        {node.allRows.map((r, index) => {
          const selected = selection?.kind === "file" && selection.path === r.path;
          const hovered = hoverKey === r.path;
          return (
            <li key={r.path} className={`relative h-[22px] ${dimmed(focus, keyFor(r.path, index)) ? "opacity-35" : ""}`}>
              <Ports id={r.path} />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => {
                  data.onSelectFile(r.path);
                  list.current?.focus({ preventScroll: true });
                }}
                onMouseEnter={() => data.onHover({ kind: "file", path: r.path })}
                onMouseLeave={() => data.onHover(null)}
                title={r.path}
                aria-pressed={selected}
                className={`flex h-full w-full items-center gap-3 px-3 text-left font-mono text-xs whitespace-nowrap ${
                  selected ? "bg-accent/12 text-accent" : hovered ? "bg-accent/10" : "hover:bg-surface-sunken"
                }`}
              >
                <span className="flex-1">{r.label}</span>
                <span className="text-[11px] text-text-faint">{fanText(r.fanIn, r.fanOut)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {node.scrolls ? (
        <EdgeRow nodeId={node.id} which={BELOW} count={node.below} focus={focus} hoverKey={hoverKey} onPage={() => page(1)} />
      ) : null}
    </div>
  );
}
