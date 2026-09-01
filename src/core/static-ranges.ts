import { parse, type ParserPlugin } from "@babel/parser";

export interface StaticRange {
  start: number;
  end: number;
  interpolationAfter: boolean;
}

interface AstNode {
  type?: unknown;
  start?: unknown;
  end?: unknown;
  tail?: unknown;
  callee?: unknown;
}

function isAstNode(value: unknown): value is AstNode & Record<string, unknown> {
  return typeof value === "object" && value !== null && "type" in value;
}

function isModuleSourceString(
  parent: AstNode | undefined,
  key: string | undefined,
): boolean {
  if (parent === undefined) return false;

  if (
    key === "source" &&
    (parent.type === "ImportDeclaration" ||
      parent.type === "ExportNamedDeclaration" ||
      parent.type === "ExportAllDeclaration" ||
      parent.type === "ImportExpression")
  ) {
    return true;
  }

  return (
    parent.type === "CallExpression" &&
    key === "arguments" &&
    isAstNode(parent.callee) &&
    parent.callee.type === "Import"
  );
}

function parserPlugins(filename: string): ParserPlugin[] {
  const lowerFilename = filename.toLowerCase();
  const plugins: ParserPlugin[] = ["decorators-legacy", "importAttributes"];

  if (
    lowerFilename.endsWith(".js") ||
    lowerFilename.endsWith(".jsx") ||
    lowerFilename.endsWith(".tsx")
  ) {
    plugins.push("jsx");
  }
  if (lowerFilename.endsWith(".ts") || lowerFilename.endsWith(".tsx")) {
    plugins.push("typescript");
  }

  return plugins;
}

export function findStaticRanges(source: string, filename: string): StaticRange[] {
  const ast = parse(source, {
    sourceType: "unambiguous",
    plugins: parserPlugins(filename),
  });
  const ranges: StaticRange[] = [];

  const visit = (value: unknown, parent?: AstNode, key?: string): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, parent, key);
      return;
    }
    if (!isAstNode(value)) return;

    if (
      value.type === "StringLiteral" &&
      typeof value.start === "number" &&
      typeof value.end === "number" &&
      !isModuleSourceString(parent, key)
    ) {
      ranges.push({
        start: value.start + 1,
        end: value.end - 1,
        interpolationAfter: false,
      });
    }

    if (
      value.type === "TemplateElement" &&
      typeof value.start === "number" &&
      typeof value.end === "number" &&
      typeof value.tail === "boolean"
    ) {
      ranges.push({
        start: value.start,
        end: value.end,
        interpolationAfter: !value.tail,
      });
    }

    for (const [childKey, child] of Object.entries(value)) {
      if (childKey !== "loc" && childKey !== "extra") visit(child, value, childKey);
    }
  };

  visit(ast);
  return ranges;
}
