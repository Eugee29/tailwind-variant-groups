import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import {
  expandVariantGroupsInText,
  splitTopLevelUtilities,
} from "tailwind-variant-groups";
import { describe, expect, it } from "vitest";
import { serializeVariantGroups } from "../src/formatter.js";
import { analyzeCandidateLists } from "../src/tailwind/analyze.js";

const stylesheet = fileURLToPath(new URL("./fixtures/tailwind.css", import.meta.url));
interface DeclarationSignature {
  atRules: string[];
  property: string;
  value: string | undefined;
  important: boolean;
}

// A fixture-scoped computed-value comparison: 16px root font, default horizontal
// writing mode, and the stylesheet's spacing token. It is not a general CSS evaluator.
function declarations(ast: unknown, spacingPx: number): DeclarationSignature[] {
  const signatures: DeclarationSignature[] = [];
  function visit(value: unknown, atRules: string[]): void {
    if (Array.isArray(value)) {
      value.forEach((node) => visit(node, atRules));
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (node.kind === "declaration") {
      const property = String(node.property);
      const rawValue = node.value as string | undefined;
      const spacing = /^calc\(var\(--spacing\) \* ([\d.]+)\)$/.exec(rawValue ?? "");
      const normalized = spacing ? `${spacingPx * Number(spacing[1])}px` : rawValue;
      const properties =
        property === "margin-block" ? ["margin-top", "margin-bottom"] : [property];
      for (const property of properties) {
        signatures.push({
          atRules,
          property,
          value: normalized,
          important: node.important === true,
        });
      }
      return;
    }
    visit(
      node.nodes,
      node.kind === "at-rule" ? [...atRules, `${node.name} ${node.params}`] : atRules,
    );
  }
  visit(ast, []);
  return signatures.sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

describe("real Tailwind semantic equivalence", () => {
  it("preserves declarations at a 16px root in horizontal writing mode", async () => {
    const input = [
      "p-4",
      "md:w-[8px]",
      "md:h-[8px]",
      "md:mt-2",
      "md:mb-2",
      "md:hover:bg-brand",
      "md:hover:text-white",
    ];
    const expectedCanonical = [
      "p-4",
      "md:size-2",
      "md:my-2",
      "md:hover:bg-brand",
      "md:hover:text-white",
    ];
    const expanded = splitTopLevelUtilities(
      expandVariantGroupsInText(input.join(" ")).code,
    );
    const result = await analyzeCandidateLists({
      stylesheet,
      lists: [expanded],
      options: { canonicalize: true, collapse: true, rootFontSize: 16 },
    });
    // Preserve source ordering here so this assertion isolates canonicalization/grouping.
    const formatted = serializeVariantGroups(result.lists[0]!, {
      sort: false,
      group: true,
    });
    const flattened = splitTopLevelUtilities(expandVariantGroupsInText(formatted).code);
    expect(flattened).toEqual(expectedCanonical);

    const designSystem = await __unstable__loadDesignSystem(
      await fs.readFile(stylesheet, "utf8"),
      { base: path.dirname(stylesheet) },
    );
    expect(designSystem.theme.get(["--spacing"])).toBe("0.25rem");
    const spacingPx = Number.parseFloat(designSystem.theme.get(["--spacing"])!) * 16;
    const before = designSystem.candidatesToAst(input);
    const after = designSystem.candidatesToAst(flattened);
    expect(before.every((ast) => ast !== null && ast.length > 0)).toBe(true);
    expect(after.every((ast) => ast !== null && ast.length > 0)).toBe(true);
    expect(declarations(after, spacingPx)).toEqual(declarations(before, spacingPx));
    expect(declarations(after, spacingPx)).toEqual(
      expect.arrayContaining([
        {
          atRules: ["@media (width >= 48rem)"],
          property: "width",
          value: "8px",
          important: false,
        },
        {
          atRules: ["@media (width >= 48rem)"],
          property: "height",
          value: "8px",
          important: false,
        },
        {
          atRules: ["@media (width >= 48rem)"],
          property: "margin-top",
          value: "8px",
          important: false,
        },
        {
          atRules: ["@media (width >= 48rem)"],
          property: "margin-bottom",
          value: "8px",
          important: false,
        },
      ]),
    );
  }, 30_000);
});
