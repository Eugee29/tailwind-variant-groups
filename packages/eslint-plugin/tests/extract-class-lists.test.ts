import path from "node:path";
import type { Rule } from "eslint";
import { Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, expect, it } from "vitest";
import {
  createClassListListeners,
  type ClassListTarget,
} from "../src/extract-class-lists.js";
import { resolveSettings } from "../src/settings.js";

interface ProbeOptions {
  attributes: string[];
  callees: string[];
  includeDynamicTemplateSegments?: boolean;
}

type RecordedTarget = Omit<ClassListTarget, "node">;

function probe(
  code: string,
  options: ProbeOptions,
  language: "js" | "jsx" | "ts" | "tsx" = "tsx",
): RecordedTarget[] {
  const linter = new Linter({ configType: "flat" });
  const rule: Rule.RuleModule = {
    meta: { type: "problem" },
    create(context) {
      return createClassListListeners(
        context,
        {
          attributes: new Set(options.attributes),
          callees: new Set(options.callees),
          includeDynamicTemplateSegments:
            options.includeDynamicTemplateSegments ?? false,
        },
        ({ node, ...target }) => {
          context.report({ node, message: JSON.stringify(target) });
        },
      );
    },
  };

  const messages = linter.verify(
    code,
    [
      {
        files: [`**/*.${language}`],
        languageOptions: {
          ecmaVersion: "latest",
          sourceType: "module",
          parser: language === "ts" || language === "tsx" ? tsParser : undefined,
          parserOptions: {
            ecmaFeatures: { jsx: language === "jsx" || language === "tsx" },
          },
        },
        plugins: { probe: { rules: { targets: rule } } },
        rules: { "probe/targets": "error" },
      },
    ],
    { filename: `fixture.${language}` },
  );

  const fatal = messages.find((message) => message.fatal);
  if (fatal) {
    throw new Error(fatal.message);
  }

  const targets = messages
    .map((message) => JSON.parse(message.message) as RecordedTarget)
    .sort((left, right) => left.range[0] - right.range[0]);

  for (const target of targets) {
    expect(code.slice(...target.range)).toBe(target.text);
  }
  for (let index = 1; index < targets.length; index += 1) {
    expect(targets[index - 1]!.range[1]).toBeLessThanOrEqual(targets[index]!.range[0]);
  }

  return targets;
}

describe("resolveSettings", () => {
  it("uses safe defaults without guessing a stylesheet", () => {
    const context = {
      settings: {},
      cwd: path.resolve("fixture-root"),
    } as unknown as Rule.RuleContext;

    const result = resolveSettings(context, {});

    expect(result).toEqual({
      stylesheet: undefined,
      attributes: new Set(["class", "className"]),
      callees: new Set(["cn", "clsx", "cva"]),
      rootFontSize: 16,
      canonicalize: true,
      collapse: true,
      sort: true,
      group: true,
    });
  });

  it("lets rule options override shared settings and resolves the stylesheet", () => {
    const cwd = path.resolve("fixture-root");
    const context = {
      settings: {
        "tailwind-variant-groups": {
          stylesheet: "styles/shared.css",
          attributes: ["data-shared"],
          callees: ["shared"],
          rootFontSize: 12,
        },
      },
      cwd,
    } as unknown as Rule.RuleContext;

    const result = resolveSettings(context, {
      stylesheet: "styles/rule.css",
      attributes: ["data-rule"],
      callees: [],
      rootFontSize: 18,
      canonicalize: false,
      collapse: false,
      sort: false,
      group: false,
    });

    expect(result).toEqual({
      stylesheet: path.resolve(cwd, "styles/rule.css"),
      attributes: new Set(["data-rule"]),
      callees: new Set(),
      rootFontSize: 18,
      canonicalize: false,
      collapse: false,
      sort: false,
      group: false,
    });
  });

  it("uses configured shared settings when rule options are absent", () => {
    const cwd = path.resolve("fixture-root");
    const context = {
      settings: {
        "tailwind-variant-groups": {
          stylesheet: "styles/shared.css",
          attributes: ["data-shared"],
          callees: ["shared"],
          rootFontSize: 12,
        },
      },
      cwd,
    } as unknown as Rule.RuleContext;

    expect(resolveSettings(context, {})).toEqual({
      stylesheet: path.resolve(cwd, "styles/shared.css"),
      attributes: new Set(["data-shared"]),
      callees: new Set(["shared"]),
      rootFontSize: 12,
      canonicalize: true,
      collapse: true,
      sort: true,
      group: true,
    });
  });

  it("resolves a stylesheet from the process cwd when context.cwd is unavailable", () => {
    const context = {
      settings: { "tailwind-variant-groups": { stylesheet: "styles/shared.css" } },
      cwd: undefined,
    } as unknown as Rule.RuleContext;

    expect(resolveSettings(context, {}).stylesheet).toBe(
      path.resolve(process.cwd(), "styles/shared.css"),
    );
  });

  it("treats an explicitly empty stylesheet as disabled", () => {
    const context = {
      settings: {
        "tailwind-variant-groups": { stylesheet: "styles/shared.css" },
      },
    } as unknown as Rule.RuleContext;

    expect(resolveSettings(context, { stylesheet: "" }).stylesheet).toBeUndefined();
  });
});

describe("createClassListListeners", () => {
  it("extracts only configured static JSX values and helper contents", () => {
    const code = `
const unrelated = "md:flex md:gap-4";
const view = <div className="md:flex md:gap-4" data-tw={\`lg:grid lg:gap-8\`} />;
const value = cn(
  "hover:bg-red-500 hover:text-white",
  enabled && "focus:ring-2 focus:ring-blue-500",
  ["sm:block sm:p-4"],
  { active: "xl:flex xl:gap-6" },
);
const dynamic = cn(\`md:flex \${runtime} md:gap-4\`);
`;

    const targets = probe(code, {
      attributes: ["className", "data-tw"],
      callees: ["cn"],
    });

    expect(targets.map((target) => target.text)).toEqual([
      "md:flex md:gap-4",
      "lg:grid lg:gap-8",
      "hover:bg-red-500 hover:text-white",
      "focus:ring-2 focus:ring-blue-500",
      "sm:block sm:p-4",
      "xl:flex xl:gap-6",
    ]);
    expect(targets.every((target) => target.formatEligible)).toBe(true);
  });

  it("exposes dynamic template quasis only as validation segments", () => {
    const code = "const value = cn(`md:flex ${runtime} md:gap-4`);";

    const targets = probe(code, {
      attributes: [],
      callees: ["cn"],
      includeDynamicTemplateSegments: true,
    });

    expect(targets).toEqual([
      {
        range: [18, 26],
        text: "md:flex ",
        formatEligible: false,
        interpolationAfter: true,
      },
      {
        range: [36, 45],
        text: " md:gap-4",
        formatEligible: false,
        interpolationAfter: false,
      },
    ]);
  });

  it.each([
    {
      language: "js" as const,
      code: String.raw`const value = clsx('md:flex md:gap-4', "before\\_after"); const unrelated = 'lg:grid';`,
      attributes: [],
      callees: ["clsx"],
      expected: ["md:flex md:gap-4", String.raw`before\\_after`],
    },
    {
      language: "jsx" as const,
      code: `const view = <div class='sm:block sm:p-4' data-tw={\`lg:grid lg:gap-8\`} title="md:hidden" />;`,
      attributes: ["class", "data-tw"],
      callees: [],
      expected: ["sm:block sm:p-4", "lg:grid lg:gap-8"],
    },
    {
      language: "ts" as const,
      code: `import { clsx as cx } from "clsx"; const value = cx(flag ? "md:flex" : \`md:grid\`, ["md:gap-4"], { active: "md:block" }) as string;`,
      attributes: [],
      callees: ["cx"],
      expected: ["md:flex", "md:grid", "md:gap-4", "md:block"],
    },
    {
      language: "tsx" as const,
      code: `const view = <Box tw={\`xl:flex xl:gap-6\`} />; const value = cn(inner("hover:block"), "focus:flex");`,
      attributes: ["tw"],
      callees: ["cn", "inner"],
      expected: ["xl:flex xl:gap-6", "hover:block", "focus:flex"],
    },
  ])(
    "extracts complete static values in $language",
    ({ language, code, attributes, callees, expected }) => {
      const targets = probe(code, { attributes, callees }, language);

      expect(targets.map((target) => target.text)).toEqual(expected);
      expect(targets.every((target) => target.formatEligible)).toBe(true);
      expect(targets.every((target) => !target.interpolationAfter)).toBe(true);
    },
  );

  it("recurses only through the allowed helper argument forms", () => {
    const code = `
cn(
  ...["spread-array"],
  { ...{ value: "spread-object" }, key: "object-value" },
  left || "logical-right",
  "logical-left" && right,
  condition ? "conditional-yes" : "conditional-no",
  unconfigured("do-not-descend"),
  () => "function-body",
);
tag\`tagged-template\`;
`;

    expect(
      probe(code, { attributes: [], callees: ["cn"] }, "js").map(
        (target) => target.text,
      ),
    ).toEqual([
      "spread-array",
      "spread-object",
      "object-value",
      "logical-right",
      "logical-left",
      "conditional-yes",
      "conditional-no",
    ]);
  });

  it("unwraps TypeScript assertions, non-null expressions, and satisfies expressions", () => {
    const code = `cn("as-value" as const, (<const>"assertion-value"), "non-null"!, "satisfies-value" satisfies string);`;

    expect(
      probe(code, { attributes: [], callees: ["cn"] }, "ts").map(
        (target) => target.text,
      ),
    ).toEqual(["as-value", "assertion-value", "non-null", "satisfies-value"]);
  });
});
