import { ts } from "ts-morph";
import type { ImportKind } from "./contract";

export interface RawImport {
  line: number;
  specifier: string | null;
  kind: ImportKind;
  typeOnly: boolean;
  expression: string | null;
}

function literalText(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function allTypeOnly(elements: ts.NodeArray<ts.ImportSpecifier | ts.ExportSpecifier>): boolean {
  return elements.length > 0 && elements.every((e) => e.isTypeOnly);
}

const MAX_EXPRESSION = 80;

export function extractImports(sf: ts.SourceFile): RawImport[] {
  const out: RawImport[] = [];
  const push = (
    node: ts.Node,
    kind: ImportKind,
    specifier: string | null,
    typeOnly: boolean,
    expression: ts.Node | null = null,
  ): void => {
    const text = expression?.getText(sf) ?? null;
    out.push({
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      specifier,
      kind,
      typeOnly,
      expression:
        text === null
          ? null
          : text.length > MAX_EXPRESSION
            ? `${text.slice(0, MAX_EXPRESSION)}…`
            : text,
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const typeOnly =
        clause?.isTypeOnly === true ||
        (clause !== undefined &&
          clause.name === undefined &&
          named !== undefined &&
          ts.isNamedImports(named) &&
          allTypeOnly(named.elements));
      push(node, "import", literalText(node.moduleSpecifier), typeOnly);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const clause = node.exportClause;
      const typeOnly =
        node.isTypeOnly ||
        (clause !== undefined && ts.isNamedExports(clause) && allTypeOnly(clause.elements));
      push(node, "reexport", literalText(node.moduleSpecifier), typeOnly);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      push(node, "require", literalText(node.moduleReference.expression), node.isTypeOnly);
    } else if (ts.isCallExpression(node)) {
      const arg = node.arguments[0];
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const spec = literalText(arg);
        push(node, "dynamic", spec, false, spec === null ? (arg ?? node) : null);
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require" &&
        node.arguments.length === 1
      ) {
        const spec = literalText(arg);
        push(node, "require", spec, false, spec === null ? arg : null);
      }
    } else if (ts.isImportTypeNode(node)) {
      const arg = node.argument;
      if (ts.isLiteralTypeNode(arg)) {
        push(node, "import", literalText(arg.literal), true);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return out;
}
