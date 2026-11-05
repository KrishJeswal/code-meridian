import { readFileSync } from "node:fs";
import { z } from "zod";
import { ParseResult } from "./contract";

// Facts a well-formed shape can still get wrong. A reader relies on every
// one of these, so a file that breaks any of them is rejected outright.
export function invariantViolations(r: ParseResult): string[] {
  const out: string[] = [];
  const paths = new Set(r.files.map((f) => f.path));
  if (paths.size !== r.files.length) out.push("duplicate file paths");

  const c = r.coverage;
  if (c.files.found !== r.files.length) out.push("coverage.files.found differs from the file count");
  if (c.files.parsed + c.files.skipped !== c.files.found) out.push("parsed + skipped does not equal found");
  for (const f of r.files) {
    if (f.parsed !== (f.skipReason === null)) out.push(`${f.path}: parsed flag disagrees with skipReason`);
  }

  const statusSum = Object.values(c.imports.byStatus).reduce((a, b) => a + b, 0);
  if (statusSum !== c.imports.total || c.imports.total !== r.imports.length)
    out.push("import status counts do not add up to the import total");

  for (const i of r.imports) {
    const isResolved = i.status === "resolved";
    if (isResolved !== (i.target !== null)) out.push(`${i.source}:${i.line}: target set without resolved status, or the reverse`);
    if (isResolved !== (i.reason === null)) out.push(`${i.source}:${i.line}: reason missing or present on the wrong status`);
    if (i.target !== null && !paths.has(i.target)) out.push(`${i.source}:${i.line}: target ${i.target} is not a file`);
  }
  for (const e of r.edges) {
    if (!paths.has(e.source) || !paths.has(e.target)) out.push(`edge ${e.source} -> ${e.target} names a missing file`);
  }
  return out;
}

export function readParseResult(file: string): ParseResult {
  const parsed = ParseResult.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`${file} does not match the contract:\n${z.prettifyError(parsed.error)}`);
  const violations = invariantViolations(parsed.data);
  if (violations.length > 0) throw new Error(`${file} is inconsistent:\n${violations.join("\n")}`);
  return parsed.data;
}
