import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { ts } from "ts-morph";
import type { ConfigRecord, ImportStatus, Reason } from "./contract";
import { isExcludedDirName, isSourcePath, toPosix } from "./walk";

export interface Outcome {
  status: ImportStatus;
  target: string | null;
  reason: Reason | null;
  detail: string | null;
}

interface LoadedConfig {
  dir: string;
  options: ts.CompilerOptions;
  fileNames: Set<string>;
  pathsBase: string;
  cache: ts.ModuleResolutionCache;
}

const IS_WINDOWS = process.platform === "win32";

function key(p: string): string {
  const n = p.replace(/\\/g, "/");
  return IS_WINDOWS ? n.toLowerCase() : n;
}

// Resolution is TypeScript's, so these only fill gaps it leaves: JS is
// source here, and JSON imports should resolve so they can be named as
// assets rather than reported as missing.
const FORCED_OPTIONS: ts.CompilerOptions = {
  allowJs: true,
  resolveJsonModule: true,
  noEmit: true,
};

const DEFAULT_OPTIONS: ts.CompilerOptions = {
  ...FORCED_OPTIONS,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.Preserve,
};

const BUILTINS = new Set(builtinModules);

const NPM_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

function packageNameOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function isRelativeOrAbsolute(specifier: string): boolean {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier === "." ||
    specifier === ".." ||
    path.isAbsolute(specifier)
  );
}

function formatDiagnostic(d: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(d.messageText, "\n");
}

function field(obj: unknown, name: string): unknown {
  return obj !== null && typeof obj === "object" && name in obj
    ? Object.getOwnPropertyDescriptor(obj, name)?.value
    : undefined;
}

function objectKeys(v: unknown): string[] {
  return v !== null && typeof v === "object" ? Object.keys(v) : [];
}

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

// Only used to explain a failure: the relative paths a package.json names
// as its root entry (types, main, module, and the "." export).
function entryPaths(pkg: unknown): string[] {
  const out: string[] = [];
  const collect = (v: unknown): void => {
    if (typeof v === "string") {
      if (v.startsWith(".") || !v.includes(":")) out.push(v);
    } else if (v !== null && typeof v === "object") {
      for (const inner of Object.values(v)) collect(inner);
    }
  };
  for (const f of ["types", "typings", "module", "main"]) collect(field(pkg, f));
  const exports = field(pkg, "exports");
  collect(typeof exports === "string" ? exports : field(exports, "."));
  return out;
}

const DECLARATION_RUNTIME_EXTENSIONS: Record<string, readonly string[]> = {
  ts: [".js", ".jsx"],
  mts: [".mjs"],
  cts: [".cjs"],
};

export interface ResolverInput {
  root: string;
  filePaths: readonly string[];
  configPaths: readonly string[];
  packageJsonPaths: readonly string[];
}

export class Resolver {
  readonly configs: ConfigRecord[] = [];
  private readonly root: string;
  private readonly loaded: LoadedConfig[] = [];
  private readonly fileSet: Set<string>;
  private readonly fileByLower = new Map<string, string>();
  private readonly workspaces = new Map<string, string>();
  private readonly entries = new Map<string, string[]>();
  private readonly declared = new Set<string>();
  private readonly host: ts.ModuleResolutionHost;
  private readonly defaultCache: ts.ModuleResolutionCache;

  constructor(input: ResolverInput) {
    this.root = input.root;
    this.fileSet = new Set(input.filePaths);
    for (const p of input.filePaths) this.fileByLower.set(p.toLowerCase(), p);
    for (const p of input.packageJsonPaths) this.readPackageJson(p);
    this.host = this.createHost();
    this.defaultCache = this.createCache(DEFAULT_OPTIONS);
    for (const p of input.configPaths) this.loadConfig(p);
  }

  private relative(abs: string): string {
    return toPosix(path.relative(this.root, abs));
  }

  private readPackageJson(absPath: string): void {
    const diagnostics: string[] = [];
    try {
      const pkg: unknown = JSON.parse(readFileSync(absPath, "utf8"));
      const name = field(pkg, "name");
      if (typeof name === "string") {
        this.workspaces.set(name, path.dirname(absPath));
        this.entries.set(name, entryPaths(pkg));
      }
      for (const f of DEPENDENCY_FIELDS)
        for (const dep of objectKeys(field(pkg, f))) this.declared.add(dep);
    } catch (e) {
      diagnostics.push(`unreadable: ${e instanceof Error ? e.message : String(e)}`);
    }
    this.configs.push({ path: this.relative(absPath), diagnostics });
  }

  private createCache(options: ts.CompilerOptions): ts.ModuleResolutionCache {
    return ts.createModuleResolutionCache(this.root, key, options);
  }

  private loadConfig(absPath: string): void {
    const diagnostics: string[] = [];
    const parsed = ts.getParsedCommandLineOfConfigFile(
      absPath,
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (d) =>
          diagnostics.push(formatDiagnostic(d)),
      },
    );
    if (parsed) {
      for (const d of parsed.errors) diagnostics.push(formatDiagnostic(d));
      const options = { ...parsed.options, ...FORCED_OPTIONS };
      // pathsBasePath is set by the config parser to the directory of the
      // config that declared `paths`, which may be an extended one.
      const base = parsed.options["pathsBasePath"];
      this.loaded.push({
        dir: path.dirname(absPath),
        options,
        fileNames: new Set(parsed.fileNames.map(key)),
        pathsBase:
          typeof base === "string"
            ? base
            : (parsed.options.baseUrl ?? path.dirname(absPath)),
        cache: this.createCache(options),
      });
    }
    this.configs.push({ path: this.relative(absPath), diagnostics });
  }

  // The config whose file list includes this file wins, deepest first; then
  // the nearest config above it; then defaults.
  private configFor(absFile: string): LoadedConfig | null {
    const k = key(absFile);
    let best: LoadedConfig | null = null;
    for (const c of this.loaded)
      if (c.fileNames.has(k) && (!best || c.dir.length > best.dir.length)) best = c;
    if (best) return best;
    for (const c of this.loaded) {
      const rel = path.relative(c.dir, absFile);
      const inside = !rel.startsWith("..") && !path.isAbsolute(rel);
      if (inside && (!best || c.dir.length > best.dir.length)) best = c;
    }
    return best;
  }

  // Workspace packages that aren't installed are mapped as if the package
  // manager had linked them into the root node_modules, which is exactly
  // what an install would do. Real paths on disk always win.
  private createHost(): ts.ModuleResolutionHost {
    const nodeModules = key(path.join(this.root, "node_modules"));
    const virtualDirs = new Set<string>();
    if (this.workspaces.size > 0) virtualDirs.add(nodeModules);
    for (const name of this.workspaces.keys()) {
      if (name.startsWith("@"))
        virtualDirs.add(`${nodeModules}/${key(name.split("/")[0])}`);
    }
    const map = (p: string): string | null => {
      const k = key(p);
      if (!k.startsWith(`${nodeModules}/`)) return null;
      const rest = p.replace(/\\/g, "/").slice(nodeModules.length + 1);
      for (const [name, dir] of this.workspaces) {
        if (rest === name || rest.startsWith(`${name}/`))
          return path.join(dir, rest.slice(name.length));
      }
      return null;
    };
    const exists = (p: string): boolean => existsSync(p);
    return {
      fileExists: (p) => {
        if (ts.sys.fileExists(p)) return true;
        const m = map(p);
        return m !== null && ts.sys.fileExists(m);
      },
      directoryExists: (p) => {
        if (ts.sys.directoryExists(p)) return true;
        if (virtualDirs.has(key(p))) return true;
        const m = map(p);
        return m !== null && ts.sys.directoryExists(m);
      },
      readFile: (p) => {
        if (ts.sys.fileExists(p)) return ts.sys.readFile(p);
        const m = map(p);
        return m === null ? undefined : ts.sys.readFile(m);
      },
      // fs.realpathSync (not .native) follows symlinks but keeps the casing
      // the import used, so a case mismatch stays detectable on Windows.
      realpath: (p) => {
        if (exists(p)) return toPosix(realpathSync(p));
        const m = map(p);
        return m === null ? p : toPosix(m);
      },
      getCurrentDirectory: () => this.root,
    };
  }

  resolve(specifier: string, absFrom: string): Outcome {
    const config = this.configFor(absFrom);
    const options = config?.options ?? DEFAULT_OPTIONS;
    const result = ts.resolveModuleName(
      specifier,
      absFrom,
      options,
      this.host,
      config?.cache ?? this.defaultCache,
    );
    const resolved = result.resolvedModule;
    if (resolved) return this.classifyResolved(resolved.resolvedFileName, specifier);
    return this.classifyUnresolved(specifier, absFrom, config);
  }

  private classifyResolved(resolvedFileName: string, specifier: string): Outcome {
    const rel = this.relative(resolvedFileName);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return { status: "external", target: null, reason: "outside-repository", detail: toPosix(resolvedFileName) };
    }
    const segments = rel.split("/");
    if (segments.includes("node_modules")) {
      return { status: "external", target: null, reason: "package", detail: packageNameOf(specifier) };
    }
    if (segments.slice(0, -1).some(isExcludedDirName)) {
      return { status: "excluded", target: null, reason: "excluded-directory", detail: rel };
    }
    const target = this.runtimeTarget(rel);
    if (this.fileSet.has(target)) {
      return { status: "resolved", target, reason: null, detail: null };
    }
    const actual = this.fileByLower.get(target.toLowerCase());
    if (actual) {
      return {
        status: "unresolved",
        target: null,
        reason: "path-case-mismatch",
        detail: `resolves to ${target}, but the file on disk is ${actual}`,
      };
    }
    if (!isSourcePath(target)) {
      return { status: "excluded", target: null, reason: "non-source-asset", detail: target };
    }
    return {
      status: "unresolved",
      target: null,
      reason: "resolved-file-not-in-file-list",
      detail: `TypeScript resolved ${target}, which the walk did not find`,
    };
  }

  // TypeScript prefers a hand-written foo.d.ts over the foo.js beside it;
  // at runtime the import loads foo.js, so the edge goes there.
  private runtimeTarget(rel: string): string {
    const m = /^(.*)\.d\.(ts|mts|cts)$/.exec(rel);
    if (!m) return rel;
    for (const e of DECLARATION_RUNTIME_EXTENSIONS[m[2]] ?? []) if (this.fileSet.has(m[1] + e)) return m[1] + e;
    return rel;
  }

  private classifyPath(absCandidate: string): Outcome | null {
    const rel = this.relative(absCandidate);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    if (rel.split("/").slice(0, -1).some(isExcludedDirName)) {
      return { status: "excluded", target: null, reason: "excluded-directory", detail: rel };
    }
    if (!isSourcePath(rel) && existsSync(absCandidate) && statSync(absCandidate).isFile()) {
      return { status: "excluded", target: null, reason: "non-source-asset", detail: rel };
    }
    return null;
  }

  private classifyUnresolved(
    specifier: string,
    absFrom: string,
    config: LoadedConfig | null,
  ): Outcome {
    if (isRelativeOrAbsolute(specifier)) {
      const abs = path.resolve(path.dirname(absFrom), specifier);
      return (
        this.classifyPath(abs) ?? {
          status: "unresolved",
          target: null,
          reason: "relative-path-not-found",
          detail:
            path.extname(specifier) !== "" && !isSourcePath(specifier)
              ? `nothing at ${this.relative(abs)}`
              : `nothing at ${this.relative(abs)} with any source extension or index file`,
        }
      );
    }

    if (specifier.startsWith("#")) {
      return {
        status: "unresolved",
        target: null,
        reason: "alias-target-not-found",
        detail: `${specifier} is a package.json "imports" alias that did not resolve`,
      };
    }

    const alias = config ? matchPaths(specifier, config) : null;
    if (alias) {
      for (const candidate of alias.candidates) {
        const outcome = this.classifyPath(candidate);
        if (outcome) return outcome;
      }
      return {
        status: "unresolved",
        target: null,
        reason: "alias-target-not-found",
        detail: `matches paths "${alias.pattern}" but nothing exists at ${alias.candidates.map((c) => this.relative(c)).join(", ")}`,
      };
    }

    const bare = specifier.startsWith("node:") ? specifier.slice(5) : specifier;
    const pkg = packageNameOf(bare);
    if (specifier.startsWith("node:") || BUILTINS.has(pkg)) {
      return { status: "external", target: null, reason: "builtin", detail: specifier };
    }
    const workspaceDir = this.workspaces.get(pkg);
    if (workspaceDir) {
      const where = this.relative(workspaceDir) || ".";
      const missing = (this.entries.get(pkg) ?? [])
        .filter((e) => !existsSync(path.resolve(workspaceDir, e)))
        .map((e) => toPosix(path.posix.join(where, e)));
      return {
        status: "unresolved",
        target: null,
        reason: "workspace-package-entry-not-found",
        detail:
          missing.length > 0
            ? `${pkg} is the package at ${where}; its entry points do not exist: ${[...new Set(missing)].join(", ")}`
            : `${pkg} is the package at ${where}, but "${specifier}" matches none of its entry points`,
      };
    }
    if (NPM_NAME.test(pkg) && this.declared.has(pkg)) {
      return { status: "external", target: null, reason: "package", detail: pkg };
    }
    return {
      status: "unresolved",
      target: null,
      reason: "undeclared-bare-specifier",
      detail: `"${pkg}" is not a dependency in any package.json and matches no path alias`,
    };
  }
}

// TypeScript's `paths` rules: an exact key wins, otherwise the matching
// wildcard pattern with the longest prefix.
function matchPaths(
  specifier: string,
  config: LoadedConfig,
): { pattern: string; candidates: string[] } | null {
  const paths = config.options.paths;
  if (!paths) return null;
  let best: { pattern: string; captured: string; prefixLength: number } | null = null;
  for (const pattern of Object.keys(paths)) {
    const star = pattern.indexOf("*");
    if (star === -1) {
      if (pattern === specifier) {
        best = { pattern, captured: "", prefixLength: Infinity };
        break;
      }
      continue;
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (
      specifier.length >= prefix.length + suffix.length &&
      specifier.startsWith(prefix) &&
      specifier.endsWith(suffix) &&
      (!best || prefix.length > best.prefixLength)
    ) {
      best = {
        pattern,
        captured: specifier.slice(prefix.length, specifier.length - suffix.length),
        prefixLength: prefix.length,
      };
    }
  }
  if (!best) return null;
  const captured = best.captured;
  return {
    pattern: best.pattern,
    candidates: paths[best.pattern].map((t) =>
      path.resolve(config.pathsBase, t.replace("*", captured)),
    ),
  };
}
