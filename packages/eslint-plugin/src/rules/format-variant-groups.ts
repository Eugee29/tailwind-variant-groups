import type { Rule } from "eslint";
import {
  expandVariantGroupsInText,
  splitTopLevelUtilities,
  VariantGroupSyntaxError,
} from "tailwind-variant-groups";
import {
  createClassListListeners,
  type ClassListTarget,
} from "../extract-class-lists.js";
import { serializeVariantGroups } from "../formatter.js";
import type { AnalyzeRequest, AnalyzeResponse } from "../protocol.js";
import { resolveSettings, type RuleOptions } from "../settings.js";
import { analyzeCandidateListsSync } from "../tailwind/client.js";

export interface FormatRuleDependencies {
  analyze(request: AnalyzeRequest): AnalyzeResponse;
}

export function createFormatVariantGroupsRule(
  dependencies: FormatRuleDependencies,
): Rule.RuleModule {
  return {
    meta: {
      type: "layout",
      fixable: "code",
      schema: [
        {
          type: "object",
          properties: {
            stylesheet: { type: "string" },
            attributes: { type: "array", items: { type: "string" }, uniqueItems: true },
            callees: { type: "array", items: { type: "string" }, uniqueItems: true },
            rootFontSize: { type: "number", minimum: 0, exclusiveMinimum: true },
            canonicalize: { type: "boolean" },
            collapse: { type: "boolean" },
            sort: { type: "boolean" },
            group: { type: "boolean" },
          },
          additionalProperties: false,
        },
      ],
      messages: {
        needsFormatting: "Format Tailwind variant groups.",
        missingStylesheet: "Configure a Tailwind stylesheet to format variant groups.",
        tailwindFailure: "Unable to format Tailwind variant groups: {{reason}}.",
      },
    },
    create(context) {
      const sourceCode = context.sourceCode;
      const settings = resolveSettings(
        context,
        context.options[0] as RuleOptions | undefined,
      );
      const targets: ClassListTarget[] = [];
      return {
        ...createClassListListeners(
          context,
          {
            attributes: settings.attributes,
            callees: settings.callees,
            includeDynamicTemplateSegments: false,
          },
          (target) => {
            if (target.formatEligible) targets.push(target);
          },
        ),
        "Program:exit"(node) {
          if (!settings.stylesheet) {
            context.report({ node, messageId: "missingStylesheet" });
            return;
          }
          const validTargets: ClassListTarget[] = [];
          const lists: string[][] = [];
          for (const target of targets) {
            try {
              const expansion = expandVariantGroupsInText(target.text, {
                filename: context.filename,
                source: sourceCode.text,
                offset: target.range[0],
              });
              const list = splitTopLevelUtilities(expansion.code);
              if (list.length) {
                validTargets.push(target);
                lists.push(list);
              }
            } catch (error) {
              if (!(error instanceof VariantGroupSyntaxError)) throw error;
            }
          }
          if (!lists.length) return;

          let outputs: string[];
          try {
            const response = dependencies.analyze({
              stylesheet: settings.stylesheet,
              lists,
              options: {
                canonicalize: settings.canonicalize,
                collapse: settings.collapse,
                rootFontSize: settings.rootFontSize,
              },
            });
            if (response.lists.length !== lists.length)
              throw new Error("Tailwind returned an unexpected number of class lists");
            // Finish the entire batch before reporting, so failures cannot leave partial fixes.
            outputs = response.lists.map((list) =>
              serializeVariantGroups(list, settings),
            );
          } catch (error) {
            context.report({
              node,
              messageId: "tailwindFailure",
              data: { reason: error instanceof Error ? error.message : String(error) },
            });
            return;
          }
          validTargets.forEach((target, index) => {
            const output = outputs[index]!;
            if (output === target.text) return;
            context.report({
              node: target.node,
              loc: {
                start: sourceCode.getLocFromIndex(target.range[0]),
                end: sourceCode.getLocFromIndex(target.range[1]),
              },
              messageId: "needsFormatting",
              fix: (fixer) => fixer.replaceTextRange(target.range, output),
            });
          });
        },
      };
    },
  };
}

export const formatVariantGroupsRule = createFormatVariantGroupsRule({
  analyze: analyzeCandidateListsSync,
});
