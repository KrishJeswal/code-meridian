import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ExcludedPath, SkipReason } from "./contract";

export const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const;

const DECLARATION = /\.d\.(ts|mts|cts)$/;

// tsconfig.app.json and friends matter: solution-style roots keep their
// path aliases in the referenced configs, not the root one.
const CONFIG_FILE = /^(tsconfig|jsconfig)(\.[\w-]+)?\.json$/;

// Files this big are almost always bundled or generated output.
export const MAX_FILE_BYTES = 1_000_000;

// Structural exclusions only. Dot-directories cover VCS, caches and tool
// output without naming any particular framework's folder.
const EXCLUDED_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
]);

export function isExcludedDirName(name: string): boolean {
  return name.startsWith(".") || EXCLUDED_DIR_NAMES.has(name);
}

export function isSourcePath(p: string): boolean {
  return SOURCE_EXTENSIONS.some((ext) => p.endsWith(ext));
}

export interface WalkedFile {
  path: string;
  absPath: string;
  module: string;
  sizeBytes: number;
  lines: number | null;
  sha256: string;
  text: string | null;
  skipReason: SkipReason | null;
  skipDetail: string | null;
}

export interface WalkResult {
  files: WalkedFile[];
  excludedPaths: ExcludedPath[];
  packageJsonPaths: string[];
  configPaths: string[];
}

export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

export function moduleOf(relPath: string): string {
  const dir = path.posix.dirname(relPath);
  return dir === "" ? "." : dir;
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return text.endsWith("\n") ? n - 1 : n;
}

function readFile(absPath: string, relPath: string): WalkedFile {
  const bytes = readFileSync(absPath);
  const base = {
    path: relPath,
    absPath,
    module: moduleOf(relPath),
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  if (bytes.includes(0)) {
    return {
      ...base,
      lines: null,
      text: null,
      skipReason: "binary-content",
      skipDetail: "file contains NUL bytes",
    };
  }
  const text = bytes.toString("utf8");
  const lines = countLines(text);
  if (DECLARATION.test(relPath)) {
    return {
      ...base,
      lines,
      text: null,
      skipReason: "declaration-file",
      skipDetail: "type declarations only, no runtime code",
    };
  }
  if (bytes.length > MAX_FILE_BYTES) {
    return {
      ...base,
      lines,
      text: null,
      skipReason: "too-large",
      skipDetail: `${bytes.length} bytes, limit ${MAX_FILE_BYTES}`,
    };
  }
  return { ...base, lines, text, skipReason: null, skipDetail: null };
}

export function walkRepository(root: string): WalkResult {
  const files: WalkedFile[] = [];
  const excludedPaths: ExcludedPath[] = [];
  const packageJsonPaths: string[] = [];
  const configPaths: string[] = [];

  const visit = (absDir: string): void => {
    const entries = readdirSync(absDir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      const abs = path.join(absDir, entry.name);
      const rel = toPosix(path.relative(root, abs));
      if (entry.isSymbolicLink()) {
        excludedPaths.push({ path: rel, reason: "symlink" });
      } else if (entry.isDirectory()) {
        if (isExcludedDirName(entry.name))
          excludedPaths.push({ path: rel, reason: "excluded-directory-name" });
        else visit(abs);
      } else if (entry.isFile()) {
        if (entry.name === "package.json") packageJsonPaths.push(abs);
        else if (CONFIG_FILE.test(entry.name)) configPaths.push(abs);
        else if (isSourcePath(entry.name)) files.push(readFile(abs, rel));
      }
    }
  };
  visit(root);

  return { files, excludedPaths, packageJsonPaths, configPaths };
}
