import { z } from "zod";

// The output file is the contract every later phase reads. Bump the version on
// any change a reader would notice.
export const SCHEMA_VERSION = 1;

export const SkipReason = z.enum([
  "declaration-file",
  "too-large",
  "binary-content",
  "syntax-error",
]);

export const ImportKind = z.enum(["import", "reexport", "dynamic", "require"]);

export const ImportStatus = z.enum([
  "resolved",
  "external",
  "excluded",
  "unresolved",
]);

export const ExternalReason = z.enum([
  "package",
  "builtin",
  "outside-repository",
]);

export const ExcludedReason = z.enum([
  "non-source-asset",
  "excluded-directory",
  "require-not-parsed",
]);

export const UnresolvedReason = z.enum([
  "relative-path-not-found",
  "alias-target-not-found",
  "workspace-package-entry-not-found",
  "undeclared-bare-specifier",
  "non-literal-dynamic-import",
  "path-case-mismatch",
  "resolved-file-not-in-file-list",
]);

export const Reason = z.union([ExternalReason, ExcludedReason, UnresolvedReason]);

export const FileRecord = z.object({
  path: z.string(),
  module: z.string(),
  parsed: z.boolean(),
  skipReason: SkipReason.nullable(),
  skipDetail: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative(),
  lines: z.number().int().nonnegative().nullable(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  role: z.string().nullable(),
  fanIn: z.number().int().nonnegative(),
  fanOut: z.number().int().nonnegative(),
});

export const ImportRecord = z.object({
  source: z.string(),
  line: z.number().int().positive(),
  specifier: z.string().nullable(),
  kind: ImportKind,
  typeOnly: z.boolean(),
  status: ImportStatus,
  target: z.string().nullable(),
  reason: Reason.nullable(),
  detail: z.string().nullable(),
});

export const EdgeRecord = z.object({
  source: z.string(),
  target: z.string(),
  kinds: z.array(ImportKind).min(1),
  typeOnly: z.boolean(),
});

export const ReasonSummary = z.object({
  status: ImportStatus,
  reason: Reason,
  count: z.number().int().positive(),
  examples: z.array(ImportRecord),
});

export const KindSummary = z.object({
  found: z.number().int().nonnegative(),
  resolved: z.number().int().nonnegative(),
});

export const Coverage = z.object({
  files: z.object({
    found: z.number().int().nonnegative(),
    parsed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    skippedByReason: z.partialRecord(SkipReason, z.number().int().positive()),
  }),
  imports: z.object({
    total: z.number().int().nonnegative(),
    byStatus: z.record(ImportStatus, z.number().int().nonnegative()),
    byKind: z.record(ImportKind, KindSummary),
    byReason: z.array(ReasonSummary),
  }),
});

// Paths the walk did not enter, so nothing beneath them was found or counted.
export const ExcludedPath = z.object({
  path: z.string(),
  reason: z.enum(["excluded-directory-name", "symlink"]),
});

export const ConfigRecord = z.object({
  path: z.string(),
  diagnostics: z.array(z.string()),
});

export const ParseResult = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  root: z.string(),
  generatedAt: z.iso.datetime(),
  typescriptVersion: z.string(),
  adapter: z.string(),
  configs: z.array(ConfigRecord),
  excludedPaths: z.array(ExcludedPath),
  files: z.array(FileRecord),
  imports: z.array(ImportRecord),
  edges: z.array(EdgeRecord),
  coverage: Coverage,
});

export type SkipReason = z.infer<typeof SkipReason>;
export type ImportKind = z.infer<typeof ImportKind>;
export type ImportStatus = z.infer<typeof ImportStatus>;
export type Reason = z.infer<typeof Reason>;
export type FileRecord = z.infer<typeof FileRecord>;
export type ImportRecord = z.infer<typeof ImportRecord>;
export type EdgeRecord = z.infer<typeof EdgeRecord>;
export type Coverage = z.infer<typeof Coverage>;
export type ConfigRecord = z.infer<typeof ConfigRecord>;
export type ExcludedPath = z.infer<typeof ExcludedPath>;
export type ParseResult = z.infer<typeof ParseResult>;
