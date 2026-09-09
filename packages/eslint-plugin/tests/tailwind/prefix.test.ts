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

describe("configured Tailwind prefixes", () => {
  it.each([
    { input: "acme:md:flex", output: "acme:md:flex", sort: true, group: true },
    {
      input: "acme:md:flex acme:md:gap-4",
      output: "acme:(md:(flex gap-4))",
      sort: true,
      group: true,
    },
    {
      input: "acme:(md:(flex gap-4))",
      output: "acme:(md:(flex gap-4))",
      sort: true,
      group: true,
    },
    {
      input: "acme:md:hover:bg-red-500 acme:md:hover:text-white",
      output: "acme:(md:(hover:(bg-red-500 text-white)))",
      sort: true,
      group: true,
    },
    {
      input: "acme:md:gap-4 acme:md:flex",
      output: "acme:(md:(gap-4 flex))",
      sort: false,
      group: true,
    },
    {
      input: "acme:(md:(gap-4 flex))",
      output: "acme:md:flex acme:md:gap-4",
      sort: true,
      group: false,
    },
    {
      input: "acme:(md:(gap-4 flex))",
      output: "acme:md:gap-4 acme:md:flex",
      sort: false,
      group: false,
    },
  ])(
    "preserves the outermost prefix: $input (sort=$sort, group=$group)",
    async ({ input, output, sort, group }) => {
      const designSystem = await __unstable__loadDesignSystem(
        await fs.readFile(stylesheet, "utf8"),
        { base: path.dirname(stylesheet) },
      );
      for (const canonicalize of [false, true]) {
        const analyze = (candidates: string[]) =>
          analyzeCandidateLists({
            stylesheet,
            lists: [candidates],
            options: { canonicalize, collapse: true, rootFontSize: 16 },
          });
        const before = expand(input);
        const result = await analyze(before);
        expect(
          result.lists[0]!.every(
            (item) =>
              item.parsed &&
              item.variants[0] === "acme" &&
              !item.utility.startsWith("acme:"),
          ),
          JSON.stringify(result),
        ).toBe(true);
        const formatted = serializeVariantGroups(result.lists[0]!, { sort, group });
        expect(formatted).toBe(output);
        const flattened = expand(formatted);
        expect(flattened).toEqual(expand(output));
        expect(
          flattened.every(
            (candidate) => designSystem.parseCandidate(candidate).length > 0,
          ),
        ).toBe(true);
        const cssBefore = designSystem.candidatesToCss(before);
        const cssAfter = designSystem.candidatesToCss(flattened);
        expect(cssAfter.every((css) => typeof css === "string" && css.length > 0)).toBe(
          true,
        );
        expect([...cssAfter].sort()).toEqual([...cssBefore].sort());
        const second = await analyze(flattened);
        expect(serializeVariantGroups(second.lists[0]!, { sort, group })).toBe(
          formatted,
        );
      }
    },
    30_000,
  );
});
