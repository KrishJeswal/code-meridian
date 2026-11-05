"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useRef, type CSSProperties } from "react";
import { MORE, handleKey, type Focus, type Selection, type ViewNode } from "@/lib/map/view";

export type MapNodeData = {
  node: ViewNode;
  focus: Focus | null;
  selection: Selection;
  onOpen: (dir: string) => void;
  onClose: (dir: string) => void;
  onSelectFile: (path: string) => void;
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

export function FolderNode({ data }: NodeProps<FolderFlowNode>) {
  const { node, focus } = data;
  const f = node.folder;
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
        className="flex h-full w-full cursor-pointer items-center rounded-[4px] border border-border bg-surface-raised px-3 font-mono text-xs whitespace-nowrap hover:border-border-strong"
      >
        {node.label}
      </div>
    </div>
  );
}

export function PanelNode({ data }: NodeProps<PanelFlowNode>) {
  const { node, focus, selection } = data;
  const f = node.folder;
  const folderSelected = selection?.kind === "folder" && selection.dir === node.id;
  const anyActive =
    focus === null ||
    node.rows.some((r) => focus.active.has(r.path)) ||
    focus.active.has(handleKey(node.id, MORE));

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
        folderSelected ? "border-accent" : "border-border-strong"
      } ${anyActive ? "" : "opacity-35"}`}
    >
      <button
        type="button"
        onClick={() => data.onClose(node.id)}
        title="Close folder"
        className="flex h-10 shrink-0 flex-col justify-center border-b border-border px-3 text-left hover:bg-surface-sunken"
      >
        <span className="font-mono text-xs font-medium whitespace-nowrap">{node.label}</span>
        <span className="font-mono text-[11px] whitespace-nowrap text-text-muted">
          {f.files.length} files  {fanText(f.fanIn, f.fanOut)}
        </span>
      </button>
      <ul className="py-0.5">
        {node.rows.map((r) => {
          const selected = selection?.kind === "file" && selection.path === r.path;
          return (
            <li key={r.path} className={`relative h-[22px] ${dimmed(focus, r.path) ? "opacity-35" : ""}`}>
              <Ports id={r.path} />
              <button
                type="button"
                onClick={() => data.onSelectFile(r.path)}
                title={r.path}
                aria-pressed={selected}
                className={`flex h-full w-full items-center gap-3 px-3 text-left font-mono text-xs whitespace-nowrap ${
                  selected ? "bg-accent/12 text-accent" : "hover:bg-surface-sunken"
                }`}
              >
                <span className="flex-1">{r.label}</span>
                <span className="text-[11px] text-text-faint">{fanText(r.fanIn, r.fanOut)}</span>
              </button>
            </li>
          );
        })}
        {node.hidden > 0 ? (
          <li
            className={`relative flex h-[22px] items-center px-3 text-[11px] text-text-muted ${
              dimmed(focus, handleKey(node.id, MORE)) ? "opacity-35" : ""
            }`}
          >
            <Ports id={MORE} />
            {node.hidden} more files not shown
          </li>
        ) : null}
      </ul>
    </div>
  );
}
