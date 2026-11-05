import type { MapEdge, MapFile } from "@/lib/map/view";
import type { RepoInfo } from "./pane";
import { Rail } from "./rail";
import { MapShell } from "./shell";

// The three columns are fixed from this phase on: later phases fill the rail
// and the detail pane, they don't move them.
export function MapWorkspace({ files, edges, repo }: { files: MapFile[]; edges: MapEdge[]; repo: RepoInfo }) {
  return <MapShell rail={<Rail files={files} />} files={files} edges={edges} repo={repo} />;
}
