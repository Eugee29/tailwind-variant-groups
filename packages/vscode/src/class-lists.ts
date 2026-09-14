import { parse, type ParserPlugin } from "@babel/parser";
import {
  parseVariantGroupClassList,
  type ClassListNode,
  type TextRange,
} from "tailwind-variant-groups";

export const DEFAULT_ATTRIBUTES = ["class", "className"] as const;
export const DEFAULT_CALLEES = ["cn", "clsx", "cva"] as const;

export interface ExtractClassListOptions {
  attributes: ReadonlySet<string>;
  callees: ReadonlySet<string>;
}

export interface ExtractedClassList {
  text: string;
  range: TextRange;
  nodes: ClassListNode[];
}

interface AstNode {
  type: string;
  start?: number | null;
  end?: number | null;
  [key: string]: unknown;
}

function asAstNode(value: unknown): AstNode | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as { type?: unknown }).type !== "string"
  ) {
    return undefined;
  }
  return value as AstNode;
}

function nodeRange(node: AstNode): TextRange | undefined {
  return typeof node.start === "number" && typeof node.end === "number"
    ? { start: node.start, end: node.end }
    : undefined;
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

export function extractStaticClassLists(
  source: string,
  filename: string,
  options: ExtractClassListOptions,
): ExtractedClassList[] {
  const ast = parse(source, {
    sourceType: "unambiguous",
    plugins: parserPlugins(filename),
  });
  const results: ExtractedClassList[] = [];
  const emitted = new WeakSet<object>();

  function emit(node: AstNode, range: TextRange): void {
    if (emitted.has(node)) return;
    emitted.add(node);
    const text = source.slice(range.start, range.end);
    results.push({
      text,
      range,
      nodes: parseVariantGroupClassList(text, { validateDelimiters: true }),
    });
  }

  function visitLiteralOrTemplate(node: AstNode): boolean {
    const range = nodeRange(node);
    if (!range) return true;

    if (node.type === "StringLiteral") {
      emit(node, { start: range.start + 1, end: range.end - 1 });
      return true;
    }

    if (node.type !== "TemplateLiteral") return false;
    const expressions = Array.isArray(node.expressions) ? node.expressions : [];
    if (expressions.length === 0) {
      emit(node, { start: range.start + 1, end: range.end - 1 });
    }
    return true;
  }

  function visitWrappedDirectValue(value: unknown): void {
    let node = asAstNode(value);
    while (node) {
      if (visitLiteralOrTemplate(node)) return;
      switch (node.type) {
        case "JSXExpressionContainer":
        case "ParenthesizedExpression":
        case "ChainExpression":
        case "TSAsExpression":
        case "TSTypeAssertion":
        case "TSNonNullExpression":
        case "TSInstantiationExpression":
        case "TSSatisfiesExpression":
          node = asAstNode(node.expression);
          break;
        default:
          return;
      }
    }
  }

  function visitCallValue(value: unknown): void {
    const node = asAstNode(value);
    if (!node || visitLiteralOrTemplate(node)) return;

    switch (node.type) {
      case "ArrayExpression":
        if (Array.isArray(node.elements)) node.elements.forEach(visitCallValue);
        return;
      case "ObjectExpression":
        if (Array.isArray(node.properties)) {
          node.properties.forEach((propertyValue) => {
            const property = asAstNode(propertyValue);
            if (!property) return;
            visitCallValue(
              property.type === "SpreadElement" ? property.argument : property.value,
            );
          });
        }
        return;
      case "SpreadElement":
        visitCallValue(node.argument);
        return;
      case "ConditionalExpression":
        visitCallValue(node.consequent);
        visitCallValue(node.alternate);
        return;
      case "LogicalExpression":
        visitCallValue(node.left);
        visitCallValue(node.right);
        return;
      case "ParenthesizedExpression":
      case "ChainExpression":
      case "TSAsExpression":
      case "TSTypeAssertion":
      case "TSNonNullExpression":
      case "TSInstantiationExpression":
      case "TSSatisfiesExpression":
        visitCallValue(node.expression);
        return;
      default:
        return;
    }
  }

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = asAstNode(value);
    if (!node) return;

    if (node.type === "JSXAttribute") {
      const name = asAstNode(node.name);
      if (
        name?.type === "JSXIdentifier" &&
        typeof name.name === "string" &&
        options.attributes.has(name.name)
      ) {
        visitWrappedDirectValue(node.value);
      }
    } else if (node.type === "CallExpression") {
      const callee = asAstNode(node.callee);
      if (
        callee?.type === "Identifier" &&
        typeof callee.name === "string" &&
        options.callees.has(callee.name) &&
        Array.isArray(node.arguments)
      ) {
        node.arguments.forEach(visitCallValue);
      }
    }

    for (const [key, child] of Object.entries(node)) {
      if (key !== "loc" && key !== "extra") visit(child);
    }
  }

  visit(ast);
  return results.sort((left, right) => left.range.start - right.range.start);
}
