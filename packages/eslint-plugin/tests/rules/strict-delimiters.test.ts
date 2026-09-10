import { Linter } from "eslint";
import { describe, expect, it, vi } from "vitest";
import { createFormatVariantGroupsRule } from "../../src/rules/format-variant-groups.js";
import { noInvalidVariantGroupsRule } from "../../src/rules/no-invalid-variant-groups.js";

vi.mock("../../src/tailwind/client.js", () => ({
  analyzeCandidateListsSync: () => {
    throw new Error("Use the injected analyzer");
  },
}));

describe("shared strict delimiter validation", () => {
  it.each([
    ["md:(flex))", 9],
    ["md:(flex gap-4)]", 15],
    ["md:(flex gap-4)}", 15],
    ["md:([flex)]", 9],
    ["md:((flex gap-4))", 4],
    ["md:(flex)hover:(gap-4)", 9],
    ["md:(flex [gap-4))", 15],
    [")", 0],
    ["]", 0],
    ["}", 0],
  ] as const)(
    "reports one character and offers no combined-rule fix: %s",
    (text, index) => {
      const analyze = vi.fn(() => ({ lists: [] }));
      const linter = new Linter();
      const code = `\ncn("${text}")`;
      const config: Linter.Config[] = [
        {
          plugins: {
            tw: {
              rules: {
                syntax: noInvalidVariantGroupsRule,
                format: createFormatVariantGroupsRule({ analyze }),
              },
            },
          },
          settings: { "tailwind-variant-groups": { stylesheet: "styles.css" } },
          rules: { "tw/syntax": "error", "tw/format": "warn" },
        },
      ];
      const result = linter.verifyAndFix(code, config);
      expect(result).toMatchObject({ fixed: false, output: code });
      expect(result.messages).toEqual([
        expect.objectContaining({
          messageId: "invalidGroup",
          line: 2,
          column: 5 + index,
          endLine: 2,
          endColumn: 6 + index,
        }),
      ]);
      expect(result.messages[0]!.fix).toBeUndefined();
      expect(analyze).not.toHaveBeenCalled();
    },
  );

  it.each([
    'cn("[&:is(button,a)]:(flex gap-4)")',
    String.raw`cn('md:(content-[\'hello)\'] flex)')`,
    String.raw`cn("md:(content-[\"hello]\"] flex)")`,
    "cn(\"md:(content-[')_[}_]'] w-[calc(100%-2rem)] bg-(--brand))\")",
    String.raw`cn("md:(custom\] flex)")`,
    "cn(`bg-[${color}] md:(flex gap-4)`)",
    "cn(`md:(flex gap-4) ${color} hover:(block hidden)`)",
  ])(
    "accepts arbitrary syntax and complete groups around interpolation: %s",
    (code) => {
      expect(
        new Linter().verify(code, [
          {
            plugins: { tw: { rules: { syntax: noInvalidVariantGroupsRule } } },
            rules: { "tw/syntax": "error" },
          },
        ]),
      ).toEqual([]);
    },
  );

  it("reports a group crossing an interpolation once", () => {
    const result = new Linter().verify("cn(`md:(bg-${color})`)", [
      {
        plugins: { tw: { rules: { syntax: noInvalidVariantGroupsRule } } },
        rules: { "tw/syntax": "error" },
      },
    ]);
    expect(result).toEqual([
      expect.objectContaining({
        messageId: "invalidGroup",
        line: 1,
        column: 8,
        endColumn: 9,
      }),
    ]);
    expect(result[0]!.message).toContain("cannot cross a template interpolation");
  });
});
