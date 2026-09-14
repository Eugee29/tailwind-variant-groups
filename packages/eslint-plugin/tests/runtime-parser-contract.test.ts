import path from "node:path";
import { Linter } from "eslint";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("tailwind-variant-groups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("tailwind-variant-groups")>();
  return {
    ...actual,
    expandVariantGroupsInText: vi.fn(actual.expandVariantGroupsInText),
    splitTopLevelUtilities: vi.fn(actual.splitTopLevelUtilities),
  };
});

vi.mock("../src/tailwind/client.js", () => ({
  analyzeCandidateListsSync: () => {
    throw new Error("The contract test must use its injected analyzer");
  },
}));

import * as runtimeParser from "tailwind-variant-groups";
import { createFormatVariantGroupsRule } from "../src/rules/format-variant-groups.js";
import { noInvalidVariantGroupsRule } from "../src/rules/no-invalid-variant-groups.js";

const expandVariantGroupsInText = vi.mocked(runtimeParser.expandVariantGroupsInText);
const splitTopLevelUtilities = vi.mocked(runtimeParser.splitTopLevelUtilities);
const filename = path.resolve("runtime-parser-contract.jsx");

describe("runtime parser package contract", () => {
  beforeEach(() => {
    expandVariantGroupsInText.mockClear();
    splitTopLevelUtilities.mockClear();
  });

  it("routes syntax validation through the runtime package parser", () => {
    const code = 'const view = <div className="md:(flex" />;';
    const target = "md:(flex";
    const linter = new Linter({ configType: "flat" });
    const messages = linter.verify(
      code,
      [
        {
          files: ["**/*.jsx"],
          languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
          plugins: { contract: { rules: { syntax: noInvalidVariantGroupsRule } } },
          rules: { "contract/syntax": "error" },
        },
      ],
      { filename },
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      ruleId: "contract/syntax",
      messageId: "invalidGroup",
    });
    expect(expandVariantGroupsInText).toHaveBeenCalledExactlyOnceWith(target, {
      filename,
      source: code,
      offset: code.indexOf(target),
      interpolationBoundary: false,
      validateDelimiters: true,
    });
  });

  it("routes formatting expansion and tokenization through the runtime package", () => {
    const code = 'const value = cn("md:(gap-4 flex)");';
    const target = "md:(gap-4 flex)";
    const analyze = vi.fn(() => ({
      lists: [
        [
          {
            raw: "md:flex",
            variants: ["md"],
            utility: "flex",
            order: "1",
            sourceIndex: 1,
            parsed: true,
          },
          {
            raw: "md:gap-4",
            variants: ["md"],
            utility: "gap-4",
            order: "2",
            sourceIndex: 0,
            parsed: true,
          },
        ],
      ],
    }));
    const rule = createFormatVariantGroupsRule({ analyze });
    const linter = new Linter({ configType: "flat" });
    const result = linter.verifyAndFix(
      code,
      [
        {
          files: ["**/*.jsx"],
          languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
          plugins: { contract: { rules: { format: rule } } },
          settings: {
            "tailwind-variant-groups": { stylesheet: "tailwind.css" },
          },
          rules: { "contract/format": "warn" },
        },
      ],
      { filename },
    );

    expect(result).toMatchObject({
      fixed: true,
      output: 'const value = cn("md:(flex gap-4)");',
      messages: [],
    });
    expect(expandVariantGroupsInText.mock.calls).toEqual([
      [
        target,
        {
          filename,
          source: code,
          offset: code.indexOf(target),
          validateDelimiters: true,
        },
      ],
      [
        "md:(flex gap-4)",
        {
          filename,
          source: 'const value = cn("md:(flex gap-4)");',
          offset: code.indexOf(target),
          validateDelimiters: true,
        },
      ],
    ]);
    expect(splitTopLevelUtilities.mock.calls).toEqual([
      ["md:gap-4 md:flex"],
      ["md:flex md:gap-4"],
    ]);
    expect(analyze.mock.calls).toEqual([
      [
        {
          stylesheet: path.resolve("tailwind.css"),
          lists: [["md:gap-4", "md:flex"]],
          options: { canonicalize: true, collapse: true, rootFontSize: 16 },
        },
      ],
      [
        {
          stylesheet: path.resolve("tailwind.css"),
          lists: [["md:flex", "md:gap-4"]],
          options: { canonicalize: true, collapse: true, rootFontSize: 16 },
        },
      ],
    ]);
  });
});
