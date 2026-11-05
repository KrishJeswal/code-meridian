import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { readParseResult } from "../../parser/read";
import { fold, foldAt } from "./fold";
import { shortestUniqueLabels } from "./labels";
import { layout } from "./layout";
import { stronglyConnected } from "./scc";
import { buildModel, buildView, focusOf } from "./view";

const files = (paths: string[]) =>
  paths.map((p) => ({ path: p, module: p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "." }));

describe("fold", () => {
  test("small directories merge upward, deepest first", () => {
    const folders = foldAt(
      files(["a.ts", "b.ts", "src/x.ts", "src/deep/y.ts", "src/deep/z.ts", "src/one/w.ts"]),
      2,
    );
    assert.deepEqual(folders, [
      { dir: ".", files: ["a.ts", "b.ts"] },
      { dir: "src", files: ["src/one/w.ts", "src/x.ts"] },
      { dir: "src/deep", files: ["src/deep/y.ts", "src/deep/z.ts"] },
    ]);
  });

  test("merges at one depth don't see each other", () => {
    // a/b holds one file; a/c holds one. Both merge into a in the same pass,
    // and a (now two) survives at threshold 2.
    const folders = foldAt(files(["r1.ts", "r2.ts", "a/b/1.ts", "a/c/2.ts"]), 2);
    assert.deepEqual(folders.map((f) => f.dir), [".", "a"]);
  });

  test("the threshold rises until the count is readable, and no higher", () => {
    const paths = Array.from({ length: 30 }, (_, i) => `d${i}/f${i}.ts`).concat(
      Array.from({ length: 30 }, (_, i) => `d${i}/g${i}.ts`),
    );
    const f = fold(files(paths), 10);
    assert.ok(f.folders.length <= 10);
    assert.ok(foldAt(files(paths), f.threshold - 1).length > 10);
  });
});

test("labels are the shortest unique path suffix", () => {
  const l = shortestUniqueLabels(["components/ui", "app/ui", "lib", "components/chat/index.ts", "lib/index.ts"]);
  assert.deepEqual(Object.fromEntries(l), {
    "components/ui": "components/ui",
    "app/ui": "app/ui",
    lib: "lib",
    "components/chat/index.ts": "chat/index.ts",
    "lib/index.ts": "lib/index.ts",
  });
});

describe("the checked-in fixture", () => {
  const r = readParseResult(path.join(process.cwd(), "fixtures/chatbot-ui.parse.json"));
  const model = buildModel(r.files, r.edges);
  const closed = buildView(model, new Set());

  test("node count is readable and near one per ten files", () => {
    assert.ok(closed.nodes.length <= 24, `${closed.nodes.length} nodes`);
    assert.ok(closed.nodes.length >= r.files.length / 15, `${closed.nodes.length} nodes for ${r.files.length} files`);
  });

  test("every node holds more than one file", () => {
    for (const n of closed.nodes) assert.ok(n.folder.files.length > 1, n.id);
  });

  test("every file is in exactly one node", () => {
    const all = closed.nodes.flatMap((n) => n.folder.files);
    assert.equal(new Set(all).size, r.files.length);
  });

  test("every edge ends on a node that exists, folded or open", () => {
    const biggest = [...model.folders].sort((a, b) => b.files.length - a.files.length)[0].dir;
    for (const v of [closed, buildView(model, new Set([biggest]))]) {
      const ids = new Set(v.nodes.map((n) => n.id));
      const handles = new Set(v.nodes.flatMap((n) => (n.open ? [...n.rows.map((x) => x.path), "more"] : [n.id])));
      for (const e of v.edges) {
        assert.ok(ids.has(e.source) && ids.has(e.target), e.id);
        assert.ok(handles.has(e.sourceHandle.slice(2)) && handles.has(e.targetHandle.slice(2)), e.id);
      }
    }
  });

  test("an open panel caps its rows and counts the rest", () => {
    const biggest = [...model.folders].sort((a, b) => b.files.length - a.files.length)[0];
    const panel = buildView(model, new Set([biggest.dir])).nodes.find((n) => n.id === biggest.dir);
    assert.ok(panel);
    assert.equal(panel.rows.length + panel.hidden, biggest.files.length);
    assert.ok(panel.rows.length <= 12);
  });

  test("layout is deterministic", () => {
    assert.deepEqual([...layout(closed)], [...layout(buildView(model, new Set()))]);
  });

  test("selecting a folder activates it and its neighbours only", () => {
    const hub = [...model.folders].sort((a, b) => b.fanIn - a.fanIn)[0].dir;
    const focus = focusOf(model, closed, { kind: "folder", dir: hub });
    assert.ok(focus?.active.has(hub));
    for (const e of closed.edges) {
      if (e.target === hub) assert.equal(focus?.direction.get(e.id), "in");
      else if (e.source === hub) assert.equal(focus?.direction.get(e.id), "out");
      else assert.equal(focus?.direction.has(e.id), false);
    }
  });
});

test("strongly connected components group mutual importers only", () => {
  const c = stronglyConnected(["a", "b", "c", "d"], [
    { source: "a", target: "b" },
    { source: "b", target: "a" },
    { source: "b", target: "c" },
    { source: "c", target: "d" },
  ]);
  assert.equal(c.get("a"), c.get("b"));
  assert.notEqual(c.get("b"), c.get("c"));
  assert.notEqual(c.get("c"), c.get("d"));
});

test("no two placed nodes overlap, folded or with panels open", () => {
  const r = readParseResult(path.join(process.cwd(), "fixtures/chatbot-ui.parse.json"));
  const model = buildModel(r.files, r.edges);
  for (const open of [[], ["components/ui"], ["components/ui", "lib", "db", "types"]]) {
    const p = [...layout(buildView(model, new Set(open))).values()];
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++) {
        const a = p[i];
        const b = p[j];
        const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        assert.ok(apart, `${a.id} overlaps ${b.id} with [${open}] open`);
      }
  }
});
