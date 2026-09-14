import type { Rule } from "eslint";

export interface ClassListTarget {
  node: Rule.Node;
  range: [number, number];
  text: string;
  formatEligible: boolean;
  interpolationAfter: boolean;
}

export interface ExtractOptions {
  attributes: ReadonlySet<string>;
  callees: ReadonlySet<string>;
  includeDynamicTemplateSegments: boolean;
}

interface AstNode {
  type: string;
  range?: [number, number] | null;
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

function nodeRange(node: AstNode): [number, number] | undefined {
  return Array.isArray(node.range) && node.range.length === 2 ? node.range : undefined;
}

export function createClassListListeners(
  context: Rule.RuleContext,
  options: ExtractOptions,
  onTarget: (target: ClassListTarget) => void,
): Rule.RuleListener {
  const sourceCode = context.sourceCode ?? context.getSourceCode();
  const sourceText = sourceCode.text;
  const emitted = new WeakSet<object>();

  function emit(
    node: AstNode,
    range: [number, number],
    formatEligible: boolean,
    interpolationAfter: boolean,
  ): void {
    if (emitted.has(node)) {
      return;
    }

    emitted.add(node);
    onTarget({
      node: node as unknown as Rule.Node,
      range,
      text: sourceText.slice(range[0], range[1]),
      formatEligible,
      interpolationAfter,
    });
  }

  function visitLiteralOrTemplate(node: AstNode): boolean {
    const range = nodeRange(node);
    if (!range) {
      return true;
    }

    if (node.type === "Literal" && typeof node.value === "string") {
      const opening = sourceText[range[0]];
      const closing = sourceText[range[1] - 1];
      if ((opening === '"' || opening === "'") && closing === opening) {
        emit(node, [range[0] + 1, range[1] - 1], true, false);
      }
      return true;
    }

    if (node.type !== "TemplateLiteral") {
      return false;
    }

    const expressions = Array.isArray(node.expressions) ? node.expressions : [];
    if (expressions.length === 0) {
      emit(node, [range[0] + 1, range[1] - 1], true, false);
      return true;
    }

    if (options.includeDynamicTemplateSegments) {
      const quasis = Array.isArray(node.quasis) ? node.quasis : [];
      quasis.forEach((quasiValue, index) => {
        const quasi = asAstNode(quasiValue);
        const quasiRange = quasi && nodeRange(quasi);
        const value = quasi?.value as { raw?: unknown } | undefined;
        if (!quasi || !quasiRange || typeof value?.raw !== "string") {
          return;
        }

        const start = quasiRange[0] + 1;
        emit(
          quasi,
          [start, start + value.raw.length],
          false,
          index < quasis.length - 1,
        );
      });
    }

    return true;
  }

  function visitWrappedDirectValue(value: unknown): void {
    let node = asAstNode(value);
    while (node) {
      if (visitLiteralOrTemplate(node)) {
        return;
      }

      switch (node.type) {
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
    if (!node || visitLiteralOrTemplate(node)) {
      return;
    }

    switch (node.type) {
      case "ArrayExpression": {
        const elements = Array.isArray(node.elements) ? node.elements : [];
        elements.forEach(visitCallValue);
        return;
      }
      case "ObjectExpression": {
        const properties = Array.isArray(node.properties) ? node.properties : [];
        properties.forEach((propertyValue) => {
          const property = asAstNode(propertyValue);
          if (!property) {
            return;
          }
          if (property.type === "SpreadElement") {
            visitCallValue(property.argument);
          } else if (property.type === "Property") {
            visitCallValue(property.value);
          }
        });
        return;
      }
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

  return {
    JSXAttribute(nodeValue: Rule.Node) {
      const node = nodeValue as unknown as AstNode;
      const name = asAstNode(node.name);
      if (
        !name ||
        name.type !== "JSXIdentifier" ||
        typeof name.name !== "string" ||
        !options.attributes.has(name.name)
      ) {
        return;
      }

      const value = asAstNode(node.value);
      if (!value) {
        return;
      }

      if (value.type === "JSXExpressionContainer") {
        visitWrappedDirectValue(value.expression);
      } else {
        visitWrappedDirectValue(value);
      }
    },
    CallExpression(nodeValue: Rule.Node) {
      const node = nodeValue as unknown as AstNode;
      const callee = asAstNode(node.callee);
      if (
        !callee ||
        callee.type !== "Identifier" ||
        typeof callee.name !== "string" ||
        !options.callees.has(callee.name)
      ) {
        return;
      }

      const args = Array.isArray(node.arguments) ? node.arguments : [];
      args.forEach(visitCallValue);
    },
  };
}
