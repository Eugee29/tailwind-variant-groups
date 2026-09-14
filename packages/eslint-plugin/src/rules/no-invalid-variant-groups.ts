import type { Rule } from "eslint";
import {
  expandVariantGroupsInText,
  VariantGroupSyntaxError,
} from "tailwind-variant-groups";
import { createClassListListeners } from "../extract-class-lists.js";
import { resolveSettings, type RuleOptions } from "../settings.js";
import { hasEscapedSourceSyntax } from "../source-text.js";

export const noInvalidVariantGroupsRule: Rule.RuleModule = {
  meta: {
    type: "problem",
    schema: [
      {
        type: "object",
        properties: {
          attributes: { type: "array", items: { type: "string" }, uniqueItems: true },
          callees: { type: "array", items: { type: "string" }, uniqueItems: true },
        },
        additionalProperties: false,
      },
    ],
    messages: { invalidGroup: "Invalid Tailwind variant group: {{reason}}." },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const settings = resolveSettings(
      context,
      context.options[0] as RuleOptions | undefined,
    );
    return createClassListListeners(
      context,
      {
        attributes: settings.attributes,
        callees: settings.callees,
        includeDynamicTemplateSegments: true,
      },
      (target) => {
        // Raw source escapes can be string syntax or class syntax. Match the
        // formatter's conservative boundary instead of diagnosing decoded text
        // with offsets that no longer refer to the authored source.
        const delimiter =
          target.node.type === "TemplateElement"
            ? "`"
            : sourceCode.text[target.range[0] - 1]!;
        if (hasEscapedSourceSyntax(target.text, delimiter)) return;
        try {
          expandVariantGroupsInText(target.text, {
            // Interpolation segments can begin/end inside arbitrary values. Their
            // group-boundary checks remain active without assuming balanced tokens.
            validateDelimiters: target.formatEligible,
            filename: context.filename,
            source: sourceCode.text,
            offset: target.range[0],
            interpolationBoundary: target.interpolationAfter,
          });
        } catch (error) {
          if (!(error instanceof VariantGroupSyntaxError)) throw error;
          const prefix = `${error.filename ?? "<source>"}:${error.line}:${error.column}: `;
          context.report({
            node: target.node,
            loc: {
              start: sourceCode.getLocFromIndex(error.index),
              end: sourceCode.getLocFromIndex(error.index + 1),
            },
            messageId: "invalidGroup",
            data: { reason: error.message.slice(prefix.length) },
          });
        }
      },
    );
  },
};
