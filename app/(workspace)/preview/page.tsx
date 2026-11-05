import path from "node:path";
import { MapWorkspace } from "@/components/map/workspace";
import { readParseResult } from "@/parser/read";

// Scaffolding: a parser result checked into the repo so the interface can be
// built without a database or network. Goes away once analyses are stored.
const FIXTURE = "fixtures/chatbot-ui.parse.json";

export default function PreviewPage() {
  const result = readParseResult(path.join(process.cwd(), FIXTURE));
  const files = result.files.map(({ path, module, fanIn, fanOut, role, lines, parsed, skipReason }) => ({
    path,
    module,
    fanIn,
    fanOut,
    role,
    lines,
    parsed,
    skipReason,
  }));
  const edges = result.edges.map(({ source, target, typeOnly }) => ({ source, target, typeOnly }));
  const repo = {
    // The root is an absolute path on whichever machine ran the parser.
    name: result.root.split(/[\\/]/).filter(Boolean).pop() ?? result.root,
    adapter: result.adapter,
    importsTotal: result.coverage.imports.total,
    importsResolved: result.coverage.imports.byStatus.resolved,
  };
  return <MapWorkspace files={files} edges={edges} repo={repo} />;
}
