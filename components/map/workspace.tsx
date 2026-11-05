import type { MapEdge, MapFile } from "@/lib/map/view";
import { Canvas } from "./canvas";
import { Rail } from "./rail";

// The three columns are fixed from this phase on: later phases fill the rail
// and the detail pane, they don't move them.
export function MapWorkspace({ files, edges }: { files: MapFile[]; edges: MapEdge[] }) {
  return (
    <div className="grid h-full grid-cols-[13rem_minmax(0,1fr)_20rem]">
      <Rail files={files} />
      <Canvas files={files} edges={edges} />
      <aside aria-label="Details" className="border-l border-border bg-surface-raised" />
    </div>
  );
}
