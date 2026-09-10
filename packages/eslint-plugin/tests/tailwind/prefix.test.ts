import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import {
  expandVariantGroupsInText,
  splitTopLevelUtilities,
} from "tailwind-variant-groups";
import { describe, expect, it } from "vitest";
import { serializeVariantGroups } from "../../src/formatter.js";
import { analyzeCandidateLists } from "../../src/tailwind/analyze.js";

const stylesheet = fileURLToPath(new URL("../fixtures/prefixed.css", import.meta.url));
const expand = (text: string) =>
  splitTopLevelUtilities(expandVariantGroupsInText(text).code);

const cases = [
  {
    input: "acme:md:flex",
    output: "acme:md:flex",
    expanded: ["acme:md:flex"],
    sort: true,
    group: true,
  },
  {
    input: "acme:md:flex acme:md:gap-4",
    output: "acme:(md:(flex gap-4))",
    expanded: ["acme:md:flex", "acme:md:gap-4"],
    sort: true,
    group: true,
  },
  {
    input: "acme:(md:(flex gap-4))",
    output: "acme:(md:(flex gap-4))",
    expanded: ["acme:md:flex", "acme:md:gap-4"],
    sort: true,
    group: true,
  },
  {
    input: "acme:md:hover:bg-red-500 acme:md:hover:text-white",
    output: "acme:(md:(hover:(bg-red-500 text-white)))",
    expanded: ["acme:md:hover:bg-red-500", "acme:md:hover:text-white"],
    sort: true,
    group: true,
  },
  {
    input: "acme:md:gap-4 acme:md:flex",
    output: "acme:(md:(gap-4 flex))",
    expanded: ["acme:md:gap-4", "acme:md:flex"],
    sort: false,
    group: true,
  },
  {
    input: "acme:(md:(gap-4 flex))",
    output: "acme:md:flex acme:md:gap-4",
    expanded: ["acme:md:flex", "acme:md:gap-4"],
    sort: true,
    group: false,
  },
  {
    input: "acme:(md:(gap-4 flex))",
    output: "acme:md:gap-4 acme:md:flex",
    expanded: ["acme:md:gap-4", "acme:md:flex"],
    sort: false,
    group: false,
  },
];

describe("configured Tailwind prefixes", () => {
  it.each([false, true])(
    "preserves prefix, CSS, options, and idempotence with canonicalize=%s",
    async (canonicalize) => {
      const designSystem = await __unstable__loadDesignSystem(
        await fs.readFile(stylesheet, "utf8"),
        { base: path.dirname(stylesheet) },
      );
      // Exercise the same multi-list batch boundary used by the ESLint rule.
      const analyze = (lists: string[][]) =>
        analyzeCandidateLists({
          stylesheet,
          lists,
          options: { canonicalize, collapse: true, rootFontSize: 16 },
        });
      const before = cases.map(({ input }) => expand(input));
      const result = await analyze(before);
      const flattenedLists: string[][] = [];
      for (const [index, { input, output, expanded, sort, group }] of cases.entries()) {
        expect(
          result.lists[index]!.every(
            (item) =>
              item.parsed &&
              item.variants[0] === "acme" &&
              !item.utility.startsWith("acme:"),
          ),
          input,
        ).toBe(true);
        const formatted = serializeVariantGroups(result.lists[index]!, { sort, group });
        expect(formatted, input).toBe(output);
        const flattened = expand(formatted);
        flattenedLists.push(flattened);
        expect(flattened).toEqual(expanded);
        expect(
          flattened.every(
            (candidate) => designSystem.parseCandidate(candidate).length > 0,
          ),
        ).toBe(true);
        const cssBefore = designSystem.candidatesToCss(before[index]!);
        const cssAfter = designSystem.candidatesToCss(flattened);
        expect(cssAfter.every((css) => typeof css === "string" && css.length > 0)).toBe(
          true,
        );
        expect([...cssAfter].sort()).toEqual([...cssBefore].sort());
      }
      const second = await analyze(flattenedLists);
      for (const [index, { input, output, sort, group }] of cases.entries()) {
        expect(
          serializeVariantGroups(second.lists[index]!, { sort, group }),
          input,
        ).toBe(output);
      }
    },
    30_000,
  );
});
