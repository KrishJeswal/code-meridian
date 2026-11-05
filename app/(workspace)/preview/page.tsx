import path from "node:path";
import { MapWorkspace } from "@/components/map/workspace";
import { readParseResult } from "@/parser/read";

// Scaffolding: a parser result checked into the repo so the interface can be
// built without a database or network. Goes away once analyses are stored.
const FIXTURE = "fixtures/chatbot-ui.parse.json";

export default function PreviewPage() {
  const result = readParseResult(path.join(process.cwd(), FIXTURE));
  const files = result.files.map(({ path, module, fanIn, fanOut, role }) => ({ path, module, fanIn, fanOut, role }));
  const edges = result.edges.map(({ source, target }) => ({ source, target }));
  return <MapWorkspace files={files} edges={edges} />;
}
