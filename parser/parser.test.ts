import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { ParseResult } from "./contract";
import { dedupeEdges, fanCounts } from "./graph";
import { parseRepository } from "./index";
import { invariantViolations } from "./read";

const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "meridian-parser-"));
  dirs.push(root);
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, text);
  }
  return root;
}

function importsFrom(r: ParseResult, source: string) {
  return r.imports.filter((i) => i.source === source);
}

const BASE = {
  "package.json": JSON.stringify({ name: "app", dependencies: { react: "19" } }),
  "tsconfig.json": JSON.stringify({
    compilerOptions: { module: "esnext", moduleResolution: "bundler", paths: { "@/*": ["./src/*"] } },
  }),
};

describe("graph", () => {
  test("duplicates collapse to one edge, type-only only if every import is", () => {
    const edges = dedupeEdges([
      { source: "a.ts", target: "b.ts", kind: "import", typeOnly: true },
      { source: "a.ts", target: "b.ts", kind: "reexport", typeOnly: false },
      { source: "a.ts", target: "c.ts", kind: "import", typeOnly: true },
    ]);
    assert.deepEqual(edges, [
      { source: "a.ts", target: "b.ts", kinds: ["import", "reexport"], typeOnly: false },
      { source: "a.ts", target: "c.ts", kinds: ["import"], typeOnly: true },
    ]);
    const fans = fanCounts(["a.ts", "b.ts", "c.ts"], edges);
    assert.deepEqual(fans.get("a.ts"), { fanIn: 0, fanOut: 2 });
    assert.deepEqual(fans.get("b.ts"), { fanIn: 1, fanOut: 0 });
  });

  test("an edge to a file outside the list throws instead of counting", () => {
    assert.throws(() => fanCounts(["a.ts"], [{ source: "a.ts", target: "x.ts", kinds: ["import"], typeOnly: false }]));
  });
});

describe("parseRepository", () => {
  const root = fixture({
    ...BASE,
    "src/index.ts": `export * from "./lib";\nexport { b } from "./lib/b";\nexport type { T } from "./types";\n`,
    "src/lib/index.ts": `export { a } from "./a";\n`,
    "src/lib/a.ts": `import { b } from "@/lib/b";\nimport React from "react";\nimport fs from "node:fs";\nexport const a = b;\n`,
    "src/lib/b.ts": `export const b = 1;\n`,
    "src/types.ts": `export type T = string;\n`,
    "src/dyn.ts": `const m = "./lib/b";\nimport("./lib/a");\nimport(m);\nimport "./style.css";\nimport x from "left-pad";\nconst r = require("./lib/b");\n`,
    "src/style.css": `body {}\n`,
    "src/broken.ts": `export const = ;\n`,
    "src/env.d.ts": `declare const X: string;\n`,
    "dist/out.js": `export {};\n`,
  });
  const r = parseRepository(root);

  test("the result matches the contract and its invariants", () => {
    assert.equal(ParseResult.safeParse(JSON.parse(JSON.stringify(r))).success, true);
    assert.deepEqual(invariantViolations(r), []);
  });

  test("every file is found, and every skip has a reason", () => {
    const c = r.coverage.files;
    assert.equal(c.found, 8);
    assert.equal(c.parsed + c.skipped, c.found);
    assert.deepEqual(c.skippedByReason, { "syntax-error": 1, "declaration-file": 1 });
    assert.ok(r.excludedPaths.some((e) => e.path === "dist"));
  });

  test("modules are parent directories", () => {
    assert.equal(r.files.find((f) => f.path === "src/lib/a.ts")?.module, "src/lib");
  });

  test("re-exports resolve through barrels and aliases", () => {
    const re = importsFrom(r, "src/index.ts");
    assert.deepEqual(re.map((i) => [i.kind, i.status, i.target, i.typeOnly]), [
      ["reexport", "resolved", "src/lib/index.ts", false],
      ["reexport", "resolved", "src/lib/b.ts", false],
      ["reexport", "resolved", "src/types.ts", true],
    ]);
    assert.equal(importsFrom(r, "src/lib/a.ts")[0].target, "src/lib/b.ts");
  });

  test("externals, assets, require and non-literal dynamic imports are classified", () => {
    const a = importsFrom(r, "src/lib/a.ts");
    assert.deepEqual(a.slice(1).map((i) => [i.status, i.reason]), [["external", "package"], ["external", "builtin"]]);
    const d = importsFrom(r, "src/dyn.ts").map((i) => [i.kind, i.status, i.reason]);
    assert.deepEqual(d, [
      ["dynamic", "resolved", null],
      ["dynamic", "unresolved", "non-literal-dynamic-import"],
      ["import", "excluded", "non-source-asset"],
      ["import", "unresolved", "undeclared-bare-specifier"],
      ["require", "excluded", "require-not-parsed"],
    ]);
  });

  test("fan-in counts distinct importers, not require()", () => {
    assert.equal(r.files.find((f) => f.path === "src/lib/b.ts")?.fanIn, 2);
  });
});

test("renaming an imported file yields exactly one unresolved import, with a reason", () => {
  const root = fixture({ ...BASE, "src/a.ts": `import { b } from "./b";\n`, "src/b.ts": `export const b = 1;\n` });
  assert.equal(parseRepository(root).coverage.imports.byStatus.unresolved, 0);
  renameSync(path.join(root, "src/b.ts"), path.join(root, "src/b2.ts"));
  const after = parseRepository(root);
  const unresolved = after.imports.filter((i) => i.status === "unresolved");
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].reason, "relative-path-not-found");
  assert.match(unresolved[0].detail ?? "", /src\/b/);
});

test("an alias with no target is reported, not treated as a package", () => {
  const root = fixture({ ...BASE, "src/a.ts": `import x from "@/missing";\n` });
  const [i] = parseRepository(root).imports;
  assert.equal(i.reason, "alias-target-not-found");
});

test("an uninstalled workspace package resolves to its source", () => {
  const root = fixture({
    "package.json": JSON.stringify({ name: "root", private: true }),
    "packages/ui/package.json": JSON.stringify({ name: "@acme/ui", main: "./src/index.ts" }),
    "packages/ui/src/index.ts": `export const Button = 1;\n`,
    "apps/web/package.json": JSON.stringify({ name: "web", dependencies: { "@acme/ui": "workspace:*" } }),
    "apps/web/main.ts": `import { Button } from "@acme/ui";\n`,
  });
  const [i] = parseRepository(root).imports;
  assert.equal(i.status, "resolved");
  assert.equal(i.target, "packages/ui/src/index.ts");
});
