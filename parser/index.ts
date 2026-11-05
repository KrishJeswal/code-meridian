import path from "node:path";
import { Project, ts } from "ts-morph";
import { noFrameworkAdapter, selectAdapter, type FrameworkAdapter } from "./adapter";
import {
  SCHEMA_VERSION,
  type Coverage,
  type FileRecord,
  type ImportRecord,
  type ParseResult,
  type Reason,
  type SkipReason,
} from "./contract";
import { dedupeEdges, fanCounts, type ResolvedImport } from "./graph";
import { extractImports } from "./imports";
import { Resolver } from "./resolve";
import { walkRepository, type WalkedFile } from "./walk";

export interface ParseOptions {
  adapters?: readonly FrameworkAdapter[];
}

const EXAMPLES_PER_REASON = 10;

function syntaxError(program: ts.Program, sf: ts.SourceFile): string | null {
  const [d] = program.getSyntacticDiagnostics(sf);
  if (!d) return null;
  const line = d.start === undefined ? "?" : sf.getLineAndCharacterOfPosition(d.start).line + 1;
  return `line ${line}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`;
}

export function parseRepository(rootPath: string, options: ParseOptions = {}): ParseResult {
  const root = path.resolve(rootPath);
  const walk = walkRepository(root);
  const filePaths = walk.files.map((f) => f.path);
  const adapter = selectAdapter(options.adapters ?? [noFrameworkAdapter], { root, files: filePaths });
  const resolver = new Resolver({
    root,
    filePaths,
    configPaths: walk.configPaths,
    packageJsonPaths: walk.packageJsonPaths,
  });

  // Parse-only program: no resolution, no lib files. Its only job is to
  // report syntax errors; resolution is done separately and per import.
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
    compilerOptions: { allowJs: true, noResolve: true, noLib: true, jsx: ts.JsxEmit.Preserve },
  });
  const sources = new Map<WalkedFile, ts.SourceFile>();
  for (const f of walk.files) {
    if (f.text !== null)
      sources.set(f, project.createSourceFile(f.absPath, f.text, { overwrite: true }).compilerNode);
  }
  const program = project.getProgram().compilerObject;

  const skips = new Map<WalkedFile, { reason: SkipReason; detail: string }>();
  for (const f of walk.files) {
    if (f.skipReason) skips.set(f, { reason: f.skipReason, detail: f.skipDetail ?? "" });
  }
  const imports: ImportRecord[] = [];
  for (const [f, sf] of sources) {
    const err = syntaxError(program, sf);
    if (err) {
      skips.set(f, { reason: "syntax-error", detail: err });
      continue;
    }
    for (const raw of extractImports(sf)) {
      const base = { source: f.path, line: raw.line, specifier: raw.specifier, kind: raw.kind, typeOnly: raw.typeOnly };
      if (raw.kind === "require") {
        imports.push({ ...base, status: "excluded", target: null, reason: "require-not-parsed", detail: "require() is not parsed in this version" });
      } else if (raw.specifier === null) {
        imports.push({ ...base, status: "unresolved", target: null, reason: "non-literal-dynamic-import", detail: raw.expression });
      } else {
        imports.push({ ...base, ...resolver.resolve(raw.specifier, f.absPath) });
      }
    }
  }

  const resolved: ResolvedImport[] = [];
  for (const i of imports) {
    if (i.status === "resolved" && i.target !== null)
      resolved.push({ source: i.source, target: i.target, kind: i.kind, typeOnly: i.typeOnly });
  }
  const edges = dedupeEdges(resolved);
  const fans = fanCounts(filePaths, edges);

  const files: FileRecord[] = walk.files.map((f) => {
    const skip = skips.get(f);
    const fan = fans.get(f.path) ?? { fanIn: 0, fanOut: 0 };
    return {
      path: f.path,
      module: f.module,
      parsed: !skip,
      skipReason: skip?.reason ?? null,
      skipDetail: skip?.detail ?? null,
      sizeBytes: f.sizeBytes,
      lines: f.lines,
      sha256: f.sha256,
      role: adapter.roleOf(f.path),
      fanIn: fan.fanIn,
      fanOut: fan.fanOut,
    };
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    root,
    generatedAt: new Date().toISOString(),
    typescriptVersion: ts.version,
    adapter: adapter.id,
    configs: resolver.configs,
    excludedPaths: walk.excludedPaths,
    files,
    imports,
    edges,
    coverage: summarise(files, imports),
  };
}

function summarise(files: readonly FileRecord[], imports: readonly ImportRecord[]): Coverage {
  const skippedByReason: Coverage["files"]["skippedByReason"] = {};
  for (const f of files) {
    if (f.skipReason) skippedByReason[f.skipReason] = (skippedByReason[f.skipReason] ?? 0) + 1;
  }
  const skipped = files.filter((f) => !f.parsed).length;

  const byStatus: Coverage["imports"]["byStatus"] = { resolved: 0, external: 0, excluded: 0, unresolved: 0 };
  const byKind: Coverage["imports"]["byKind"] = {
    import: { found: 0, resolved: 0 },
    reexport: { found: 0, resolved: 0 },
    dynamic: { found: 0, resolved: 0 },
    require: { found: 0, resolved: 0 },
  };
  const reasons = new Map<Reason, Coverage["imports"]["byReason"][number]>();
  for (const i of imports) {
    byStatus[i.status]++;
    byKind[i.kind].found++;
    if (i.status === "resolved") byKind[i.kind].resolved++;
    if (i.reason) {
      const r = reasons.get(i.reason) ?? { status: i.status, reason: i.reason, count: 0, examples: [] };
      r.count++;
      if (r.examples.length < EXAMPLES_PER_REASON) r.examples.push(i);
      reasons.set(i.reason, r);
    }
  }

  return {
    files: { found: files.length, parsed: files.length - skipped, skipped, skippedByReason },
    imports: {
      total: imports.length,
      byStatus,
      byKind,
      byReason: [...reasons.values()].sort((a, b) => b.count - a.count),
    },
  };
}

export type { ParseResult } from "./contract";
