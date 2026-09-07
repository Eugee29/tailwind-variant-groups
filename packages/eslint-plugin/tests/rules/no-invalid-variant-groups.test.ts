import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noInvalidVariantGroupsRule } from "../../src/rules/no-invalid-variant-groups.js";

RuleTester.describe = describe;
RuleTester.it = it;
const tester = new RuleTester({
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});

tester.run("no-invalid-variant-groups", noInvalidVariantGroupsRule, {
  valid: [
    '<div className="md:(flex gap-4)" />',
    'const value = "md:(not inspected"',
    "cn(`md:(flex gap-4) ${color} hover:(block hidden)`)",
    "cn(`md:flex ${color} md:gap-4`)",
    '<div title="md:(flex" />',
  ],
  invalid: [
    {
      code: '<div className="md:(flex" />',
      errors: [
        { messageId: "invalidGroup", line: 1, column: 20, endLine: 1, endColumn: 21 },
      ],
      output: null,
    },
    {
      code: "const value = cn(`md:(bg-${color})`)",
      errors: [
        {
          messageId: "invalidGroup",
          data: { reason: "Variant groups cannot cross a template interpolation" },
        },
      ],
      output: null,
    },
    {
      code: "cn(`ok ${color} md:(flex`)",
      errors: [
        { messageId: "invalidGroup", line: 1, column: 20, endLine: 1, endColumn: 21 },
      ],
    },
    {
      code: '<div data-tw="md:(flex" />; custom("hover:(block")',
      settings: {
        "tailwind-variant-groups": { attributes: ["data-tw"], callees: ["custom"] },
      },
      errors: [{ messageId: "invalidGroup" }, { messageId: "invalidGroup" }],
    },
  ],
});
