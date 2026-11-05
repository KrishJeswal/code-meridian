import { writeFileSync } from "node:fs";
import path from "node:path";
import type { ParseResult } from "./contract";
import { parseRepository } from "./index";
import { invariantViolations, readParseResult } from "./read";

const USAGE = `usage:
  pnpm parse <directory> [--out <file.json>]   parse a directory, print a summary
  pnpm parse --read <file.json>                 read a written result back and check it`;

const LIST_LIMIT = 40;

function print(r: ParseResult): void {
  const c = r.coverage;
  const log = console.log;
  log(`root        ${r.root}`);
  log(`adapter     ${r.adapter}    typescript ${r.typescriptVersion}`);
  for (const cfg of r.configs) {
    for (const d of cfg.diagnostics) log(`config      ${cfg.path}: ${d}`);
  }
  for (const e of r.excludedPaths) log(`not entered ${e.path}  (${e.reason})`);

  log("");
  log(`files       found ${c.files.found}   parsed ${c.files.parsed}   skipped ${c.files.skipped}`);
  const skipped = r.files.filter((f) => !f.parsed);
  for (const f of skipped.slice(0, LIST_LIMIT)) log(`  skipped   ${f.path}  ${f.skipReason}: ${f.skipDetail}`);
  if (skipped.length > LIST_LIMIT) log(`  … ${skipped.length - LIST_LIMIT} more skipped files in the output file`);
  log(`modules     ${new Set(r.files.map((f) => f.module)).size} distinct folders`);
  if (r.files.some((f) => f.module.length === 0)) log("  WARNING: a file has an empty module");

  log("");
  const s = c.imports.byStatus;
  log(`imports     ${c.imports.total} seen: resolved ${s.resolved}, external ${s.external}, excluded ${s.excluded}, unresolved ${s.unresolved}`);
  for (const [kind, k] of Object.entries(c.imports.byKind)) {
    if (k.found > 0) log(`  ${kind.padEnd(9)} found ${k.found}, resolved to a repository file ${k.resolved}`);
  }
  log(`edges       ${r.edges.length} after removing duplicates`);

  for (const group of c.imports.byReason) {
    log("");
    log(`${group.status} / ${group.reason}: ${group.count}`);
    for (const e of group.examples) {
      log(`  ${e.source}:${e.line}  ${e.specifier ?? "(no literal specifier)"}  ${e.detail ?? ""}`);
    }
    if (group.count > group.examples.length) log(`  … ${group.count - group.examples.length} more in the output file`);
  }

  log("");
  log("highest fan-in");
  for (const f of [...r.files].sort((a, b) => b.fanIn - a.fanIn).slice(0, 8)) {
    if (f.fanIn > 0) log(`  ${String(f.fanIn).padStart(4)}  ${f.path}`);
  }
}

function main(argv: string[]): number {
  const readIdx = argv.indexOf("--read");
  if (readIdx !== -1) {
    const file = argv[readIdx + 1];
    if (!file) return usage();
    const r = readParseResult(file);
    print(r);
    console.log(`\nread back ${file}: matches the contract, all invariants hold`);
    return 0;
  }

  const outIdx = argv.indexOf("--out");
  const out = outIdx === -1 ? null : argv[outIdx + 1];
  if (outIdx !== -1 && !out) return usage();
  const positional = argv.filter((a, i) => !a.startsWith("--") && !(outIdx !== -1 && i === outIdx + 1));
  if (positional.length !== 1) return usage();
  const dir = positional[0];

  const started = performance.now();
  const r = parseRepository(dir);
  const ms = Math.round(performance.now() - started);
  print(r);
  console.log(`\nparsed in ${ms} ms`);

  const violations = invariantViolations(r);
  if (violations.length > 0) {
    console.error(`\nINCONSISTENT RESULT:\n${violations.join("\n")}`);
    return 1;
  }
  if (out) {
    writeFileSync(out, JSON.stringify(r, null, 2));
    console.log(`wrote ${path.resolve(out)}`);
  }
  return 0;
}

function usage(): number {
  console.error(USAGE);
  return 2;
}

process.exitCode = main(process.argv.slice(2));
