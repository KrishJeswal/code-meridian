import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { readParseResult } from "../../parser/read";
import { fold, foldAt } from "./fold";
import { shortestUniqueLabels } from "./labels";
import { layout } from "./layout";
import { stronglyConnected } from "./scc";
import { fileDetail, folderDetail, repoSummary } from "./summary";
import { ABOVE, BELOW, WINDOW, buildModel, buildView, clampOffset, focusOf, offsetToShow } from "./view";

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

  const biggest = [...model.folders].sort((a, b) => b.files.length - a.files.length)[0];

  test("every edge ends on a handle that exists, folded, open or scrolled", () => {
    const views = [
      closed,
      buildView(model, new Set([biggest.dir])),
      buildView(model, new Set([biggest.dir]), new Map([[biggest.dir, 17]])),
      buildView(model, new Set([biggest.dir]), new Map([[biggest.dir, 999]])),
    ];
    for (const v of views) {
      const ids = new Set(v.nodes.map((n) => n.id));
      const handles = new Set(
        v.nodes.flatMap((n) => (n.open ? [...n.rows.map((x) => x.path), ...(n.scrolls ? [ABOVE, BELOW] : [])] : [n.id])),
      );
      for (const e of v.edges) {
        assert.ok(ids.has(e.source) && ids.has(e.target), e.id);
        assert.ok(handles.has(e.sourceHandle.slice(2)) && handles.has(e.targetHandle.slice(2)), e.id);
      }
    }
  });

  test("a long panel shows a window and counts what's above and below", () => {
    for (const offset of [0, 17, 999]) {
      const panel = buildView(model, new Set([biggest.dir]), new Map([[biggest.dir, offset]])).nodes.find(
        (n) => n.id === biggest.dir,
      );
      assert.ok(panel?.scrolls);
      assert.equal(panel.rows.length, WINDOW);
      assert.equal(panel.above + panel.rows.length + panel.below, biggest.files.length);
      assert.equal(panel.offset, clampOffset(offset, biggest.files.length));
    }
  });

  test("scrolling a panel never moves the layout", () => {
    const at = (offset: number) =>
      [...layout(buildView(model, new Set([biggest.dir]), new Map([[biggest.dir, offset]])))];
    assert.deepEqual(at(0), at(23));
  });

  test("offsetToShow brings any file of a long folder into the window", () => {
    for (const p of biggest.files) {
      const panel = buildView(model, new Set([biggest.dir]), new Map([[biggest.dir, offsetToShow(model, p)]])).nodes.find(
        (n) => n.id === biggest.dir,
      );
      assert.ok(panel?.rows.some((row) => row.path === p), p);
    }
  });

  test("a file's import and dependent counts equal its lists and its fans", () => {
    for (const f of r.files) {
      const d = fileDetail(model, f.path);
      assert.ok(d);
      assert.equal(d.imports.length, f.fanOut, f.path);
      assert.equal(d.importedBy.length, f.fanIn, f.path);
    }
  });

  test("the repository summary ranks and counts honestly", () => {
    const s = repoSummary(r.files);
    assert.ok(s.mostImported.length <= 10);
    assert.equal(s.importedCount, r.files.filter((f) => f.fanIn > 0).length);
    assert.equal(s.unimportedCount, r.files.filter((f) => f.parsed && f.fanIn === 0).length);
    for (let i = 1; i < s.mostImported.length; i++) assert.ok(s.mostImported[i - 1].count >= s.mostImported[i].count);
    for (const u of s.unimported) assert.equal(r.files.find((f) => f.path === u.path)?.fanIn, 0);
    assert.equal(s.unclassified, r.files.filter((f) => f.role === null).length);
  });

  test("a folder's kinds add up to its files", () => {
    for (const folder of model.folders) {
      const d = folderDetail(model, folder.dir);
      assert.equal(d?.kinds.reduce((n, k) => n + k.count, 0), folder.files.length);
    }
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
