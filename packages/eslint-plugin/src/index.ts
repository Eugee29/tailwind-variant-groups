import type { ESLint, Linter } from "eslint";
import { formatVariantGroupsRule } from "./rules/format-variant-groups.js";
import { noInvalidVariantGroupsRule } from "./rules/no-invalid-variant-groups.js";

type FlatConfig = Linter.Config;
type FlatConfigWithRules = FlatConfig & {
  plugins: NonNullable<FlatConfig["plugins"]>;
  rules: NonNullable<FlatConfig["rules"]>;
};

interface TailwindVariantGroupsPlugin extends ESLint.Plugin {
  meta: {
    name: string;
    version: string;
  };
  rules: {
    "format-variant-groups": typeof formatVariantGroupsRule;
    "no-invalid-variant-groups": typeof noInvalidVariantGroupsRule;
  };
  configs: {
    "flat/recommended": FlatConfigWithRules;
    "flat/compat-tailwindcss": FlatConfigWithRules;
  };
}

const conflictingTailwindRuleIds = [
  "classnames-order",
  "enforces-canonical-classname",
  "enforces-negative-arbitrary-values",
  "enforces-shorthand",
  "important-modifier-suffix",
  "no-arbitrary-value",
  "no-custom-classname",
  "no-contradicting-classname",
  "no-unnecessary-arbitrary-value",
] as const;

const plugin: TailwindVariantGroupsPlugin = {
  meta: {
    name: "eslint-plugin-tailwind-variant-groups",
    version: "0.1.0",
  },
  rules: {
    "format-variant-groups": formatVariantGroupsRule,
    "no-invalid-variant-groups": noInvalidVariantGroupsRule,
  },
  configs: {} as TailwindVariantGroupsPlugin["configs"],
};

plugin.configs["flat/recommended"] = {
  name: "tailwind-variant-groups/recommended",
  plugins: { "tailwind-variant-groups": plugin },
  rules: {
    "tailwind-variant-groups/format-variant-groups": "warn",
    "tailwind-variant-groups/no-invalid-variant-groups": "error",
  },
};

plugin.configs["flat/compat-tailwindcss"] = {
  ...plugin.configs["flat/recommended"],
  name: "tailwind-variant-groups/compat-tailwindcss",
  rules: {
    ...plugin.configs["flat/recommended"].rules,
    ...Object.fromEntries(
      conflictingTailwindRuleIds.map((ruleId) => [`tailwindcss/${ruleId}`, "off"]),
    ),
  },
};

export { formatVariantGroupsRule, noInvalidVariantGroupsRule };
export default plugin;
