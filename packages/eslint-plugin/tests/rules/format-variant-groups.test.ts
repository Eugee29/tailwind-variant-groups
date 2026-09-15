import path from "node:path";
import { Linter, RuleTester, type Rule } from "eslint";
import { describe, expect, it, vi } from "vitest";
import { createFormatVariantGroupsRule } from "../../src/rules/format-variant-groups.js";
import { noInvalidVariantGroupsRule } from "../../src/rules/no-invalid-variant-groups.js";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  AnalyzedCandidate,
} from "../../src/protocol.js";

// Source tests inject analysis; the bundled client/worker pair is covered by test:worker.
vi.mock("../../src/tailwind/client.js", () => ({
  analyzeCandidateListsSync: () => {
    throw new Error("Tests must inject their analyzer");
  },
}));

function candidate(raw: string, sourceIndex: number): AnalyzedCandidate {
  const parts = raw.split(":");
  const utility = parts.pop()!;
  const order = [
    "p-4",
    "size-2",
    "my-2",
    "flex",
    "gap-4",
    "border-purple-500",
    "bg-red-500",
    "bg-yellow-500",
    "bg-amber-500",
    "text-white",
  ].indexOf(utility);
  return {
    raw,
    utility,
    variants: parts,
    order: order < 0 ? null : String(order),
    parsed: order >= 0,
    sourceIndex,
  };
}

function analyze(request: AnalyzeRequest): AnalyzeResponse {
  return {
    lists: request.lists.map((list) => {
      let values = list;
      if (request.options.canonicalize && request.options.collapse) {
        values = list
          .join(" ")
          .replace("md:w-[8px] md:h-[8px] md:mt-2 md:mb-2", "md:size-2 md:my-2")
          .split(" ");
      }
      return values.map(candidate);
    }),
  };
}

RuleTester.describe = describe;
RuleTester.it = it;
const tester = new RuleTester({
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
  settings: { "tailwind-variant-groups": { stylesheet: "styles.css" } },
});
const rule = createFormatVariantGroupsRule({ analyze });
tester.run("format-variant-groups", rule, {
  valid: [
    '<div className="md:(flex gap-4)" />',
    "cn(`md:gap-4 ${value} md:flex`)",
    '<div className="md:(flex" />',
    'const untouched = "md:gap-4 md:flex"',
    'cn("", "   ")',
  ],
  invalid: [
    {
      code: '<div className="p-4 md:w-[8px] md:h-[8px] md:mt-2 md:mb-2 md:hover:bg-red-500 md:hover:text-white" />',
      output: '<div className="p-4 md:(size-2 my-2 hover:(bg-red-500 text-white))" />',
      errors: [{ messageId: "needsFormatting" }],
    },
    {
      code: '<div className="hover:border-purple-500 hover:bg-red-500 md:bg-yellow-500 hover:md:bg-amber-500" />',
      output:
        '<div className="hover:(border-purple-500 bg-red-500 md:bg-amber-500) md:bg-yellow-500" />',
      errors: [{ messageId: "needsFormatting" }],
    },
    ...["cn", "clsx", "cva"].map((callee) => ({
      code: `${callee}(["md:gap-4 md:flex"], { variant: flag && 'md:gap-4 md:flex' })`,
      output: `${callee}(["md:(flex gap-4)"], { variant: flag && 'md:(flex gap-4)' })`,
      errors: [{ messageId: "needsFormatting" }, { messageId: "needsFormatting" }],
    })),
    {
      code: '<div data-tw="md:gap-4 md:flex" />; custom(`md:gap-4 md:flex`)',
      output: '<div data-tw="md:(flex gap-4)" />; custom(`md:(flex gap-4)`)',
      settings: {
        "tailwind-variant-groups": {
          stylesheet: "styles.css",
          attributes: ["data-tw"],
          callees: ["custom"],
        },
      },
      errors: [{ messageId: "needsFormatting" }, { messageId: "needsFormatting" }],
    },
    {
      code: String.raw`cn("md:gap-4 opaque\\_thing md:flex")`,
      output: String.raw`cn("opaque\\_thing md:(flex gap-4)")`,
      errors: [{ messageId: "needsFormatting" }],
    },
    {
      code: 'cn("md:gap-4 md:flex")',
      options: [{ sort: false }],
      output: 'cn("md:(gap-4 flex)")',
      errors: [{ messageId: "needsFormatting" }],
    },
    {
      code: 'cn("md:(gap-4 flex)")',
      options: [{ group: false }],
      output: 'cn("md:flex md:gap-4")',
      errors: [{ messageId: "needsFormatting" }],
    },
    {
      code: 'cn("md:flex md:gap-4", "md:gap-4 md:flex")',
      options: [{ stylesheet: "" }],
      output: null,
      errors: [{ messageId: "missingStylesheet" }],
    },
  ],
});

function config(
  formatRule: Rule.RuleModule = rule,
  options = {},
  settings = { stylesheet: "styles.css" },
): Linter.Config[] {
  return [
    {
      files: ["**/*.jsx"],
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: {
        tw: { rules: { format: formatRule, syntax: noInvalidVariantGroupsRule } },
      },
      settings: { "tailwind-variant-groups": settings },
      rules: { "tw/format": ["warn", options], "tw/syntax": "error" },
    },
  ];
}
const filename = "fixture.jsx";
describe("source-safe atomic fixes", () => {
  it.each([
    {
      context: "single-quoted JavaScript with Tailwind quote normalization",
      code: String.raw`cn('content-["hello"]')`,
      canonical: "content-['hello']",
      output: String.raw`cn('content-[\'hello\']')`,
    },
    {
      context: "double-quoted JavaScript",
      code: String.raw`cn("content-['hello']")`,
      canonical: 'content-["hello"]',
      output: String.raw`cn("content-[\"hello\"]")`,
    },
    {
      context: "a JSX expression containing a JavaScript string",
      code: String.raw`<div className={'content-["hello"]'} />`,
      canonical: "content-['hello']",
      output: String.raw`<div className={'content-[\'hello\']'} />`,
    },
    {
      context: "a no-substitution template with backtick and interpolation characters",
      code: "cn(`content-[placeholder]`)",
      canonical: "content-['`_${value}']",
      output: "cn(`content-['\\`_\\${value}']`)",
    },
    {
      context: "a direct single-quoted JSX attribute",
      code: `<div className='content-["hello"]' />`,
      canonical: "content-['hello']",
      output: "<div className='content-[&apos;hello&apos;]' />",
    },
    {
      context: "a direct double-quoted JSX attribute",
      code: `<div className="content-['hello']" />`,
      canonical: 'content-["hello"]',
      output: '<div className="content-[&quot;hello&quot;]" />',
    },
    {
      context: "already-escaped analyzer output",
      code: "cn('content-[placeholder]')",
      canonical: String.raw`content-[\'hello\']`,
      output: String.raw`cn('content-[\'hello\']')`,
    },
    {
      context: "an even backslash run before the new quote",
      code: "cn('content-[placeholder]')",
      canonical: String.raw`content-[\\'hello']`,
      output: String.raw`cn('content-[\\\'hello\']')`,
    },
    {
      context: "already-escaped template output",
      code: "cn(`content-[placeholder]`)",
      canonical: "content-['\\`_\\${value}']",
      output: "cn(`content-['\\`_\\${value}']`)",
    },
  ])("encodes $context and remains stable", ({ code, canonical, output }) => {
    const normalize = vi.fn((request: AnalyzeRequest): AnalyzeResponse => ({
      lists: request.lists.map((list) =>
        list.map((raw, index) =>
          candidate(
            raw.includes("&apos;") || raw.includes("&quot;") ? raw : canonical,
            index,
          ),
        ),
      ),
    }));
    const rules = config(createFormatVariantGroupsRule({ analyze: normalize }));
    const linter = new Linter();
    const messages = linter.verify(code, rules, { filename });
    expect(messages).toHaveLength(1);
    expect(messages[0]!.messageId).toBe("needsFormatting");
    const first = linter.verifyAndFix(code, rules, { filename });
    expect(first.output).toBe(output);
    expect(first.messages).toEqual([]);
    // Parse independently of formatting to catch newly introduced syntax errors.
    expect(
      linter.verify(
        first.output,
        [
          {
            files: ["**/*.jsx"],
            languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
          },
        ],
        { filename },
      ),
    ).toEqual([]);
    const second = linter.verifyAndFix(first.output, rules, { filename });
    expect(second).toMatchObject({ fixed: false, output, messages: [] });
  });

  it.each([
    String.raw`cn('content-[\'hello\']', "md:gap-4 md:flex")`,
    String.raw`cn("content-[\"hello\"]", "md:gap-4 md:flex")`,
    "cn(`content-['\\`']`, \"md:gap-4 md:flex\")",
    "cn(`content-['\\${name}']`, \"md:gap-4 md:flex\")",
  ])("skips unsafe raw delimiter escapes but formats sibling strings: %s", (code) => {
    const spy = vi.fn(analyze);
    const rules = config(createFormatVariantGroupsRule({ analyze: spy }));
    const linter = new Linter();
    const messages = linter.verify(code, rules, { filename });
    expect(messages).toHaveLength(1);
    expect(messages[0]!.messageId).toBe("needsFormatting");
    expect(spy).toHaveBeenCalledExactlyOnceWith({
      stylesheet: path.resolve("styles.css"),
      lists: [["md:gap-4", "md:flex"]],
      options: { canonicalize: true, collapse: true, rootFontSize: 16 },
    });
    const result = linter.verifyAndFix(code, rules, { filename });
    expect(result.output).toBe(code.replace("md:gap-4 md:flex", "md:(flex gap-4)"));
    expect(result.messages).toEqual([]);
    expect(linter.verifyAndFix(result.output, rules, { filename })).toMatchObject({
      fixed: false,
      output: result.output,
    });
  });
});

describe("batch formatting", () => {
  it.each([
    { canonicalize: false, collapse: true },
    { canonicalize: true, collapse: false },
  ])(
    "passes canonicalize=$canonicalize and collapse=$collapse independently",
    (options) => {
      const spy = vi.fn(analyze);
      const messages = new Linter().verify(
        'cn("md:(flex gap-4)")',
        config(createFormatVariantGroupsRule({ analyze: spy }), options),
        { filename },
      );
      expect(messages).toEqual([]);
      expect(spy).toHaveBeenCalledExactlyOnceWith({
        stylesheet: path.resolve("styles.css"),
        lists: [["md:flex", "md:gap-4"]],
        options: { ...options, rootFontSize: 16 },
      });
    },
  );
  it("expands all static lists in one analyzer call with settings overridden by options", () => {
    const spy = vi.fn(analyze);
    const linter = new Linter();
    const messages = linter.verify(
      'cn("md:(flex gap-4)", "p-4")',
      config(createFormatVariantGroupsRule({ analyze: spy }), {
        stylesheet: "override.css",
        canonicalize: false,
        collapse: false,
        rootFontSize: 20,
      }),
      { filename },
    );
    expect(messages).toEqual([]);
    expect(spy).toHaveBeenCalledExactlyOnceWith({
      stylesheet: path.resolve("override.css"),
      lists: [["md:flex", "md:gap-4"], ["p-4"]],
      options: { canonicalize: false, collapse: false, rootFontSize: 20 },
    });
  });

  it("makes non-overlapping whole-inner-string fixes and is stable on a second pass", () => {
    const code = "<div className=\"md:gap-4 md:flex\" />; cn('md:gap-4 md:flex')";
    const linter = new Linter();
    const messages = linter.verify(code, config(), { filename });
    expect(messages).toHaveLength(2);
    expect(messages.map((message) => code.slice(...message.fix!.range))).toEqual([
      "md:gap-4 md:flex",
      "md:gap-4 md:flex",
    ]);
    expect(messages[0]!.fix!.range[1]).toBeLessThan(messages[1]!.fix!.range[0]);
    const first = linter.verifyAndFix(code, config(), { filename });
    expect(first.output).toBe(
      "<div className=\"md:(flex gap-4)\" />; cn('md:(flex gap-4)')",
    );
    expect(first.messages).toEqual([]);
    const second = linter.verifyAndFix(first.output, config(), { filename });
    expect(second.fixed).toBe(false);
    expect(second.output).toBe(first.output);
  });

  it.each(["throw", "count"])(
    "reports one failure and no fixes for analyzer %s failures",
    (mode) => {
      const analyzeFailure = vi.fn(() => {
        if (mode === "throw") throw new Error("worker unavailable");
        return { lists: [] };
      });
      const messages = new Linter().verify(
        'cn("md:gap-4 md:flex", "p-4")',
        config(createFormatVariantGroupsRule({ analyze: analyzeFailure })),
        { filename },
      );
      expect(messages).toHaveLength(1);
      expect(messages[0]!.messageId).toBe("tailwindFailure");
      expect(messages[0]!.fix).toBeUndefined();
    },
  );

  it("leaves malformed and dynamic values solely to syntax validation without calling Tailwind", () => {
    const spy = vi.fn(analyze);
    const messages = new Linter().verify(
      'cn("md:(flex", "  ", `md:(bg-${color})`)',
      config(createFormatVariantGroupsRule({ analyze: spy })),
      { filename },
    );
    expect(messages.map((message) => message.messageId)).toEqual([
      "invalidGroup",
      "invalidGroup",
    ]);
    expect(spy).not.toHaveBeenCalled();
    expect(messages.every((message) => !message.fix)).toBe(true);
  });

  it("reports a missing stylesheet once without invoking the analyzer", () => {
    const spy = vi.fn(analyze);
    const messages = new Linter().verify(
      'cn("md:flex", "md:gap-4")',
      config(
        createFormatVariantGroupsRule({ analyze: spy }),
        {},
        {} as { stylesheet: string },
      ),
      { filename },
    );
    expect(messages.map((message) => message.messageId)).toEqual(["missingStylesheet"]);
    expect(spy).not.toHaveBeenCalled();
  });
});
