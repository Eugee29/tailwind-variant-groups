import { describe, expect, it } from "vitest";
import {
  expandVariantGroupsInText,
  parseVariantGroupClassList,
  splitTopLevelUtilities,
} from "../../src/index.js";

describe("class-list parser public API", () => {
  it("expands groups and tokenizes arbitrary values without splitting internals", () => {
    const expanded = expandVariantGroupsInText(
      "block md:(grid grid-cols-[1fr_2fr] hover:(text-white underline))",
    );

    expect(splitTopLevelUtilities(expanded.code)).toEqual([
      "block",
      "md:grid",
      "md:grid-cols-[1fr_2fr]",
      "md:hover:text-white",
      "md:hover:underline",
    ]);
  });

  it("exposes effective candidates with source ranges", () => {
    expect(parseVariantGroupClassList("md:(flex gap-4)")).toMatchObject([
      {
        kind: "group",
        range: { start: 0, end: 15 },
        candidates: ["md:flex", "md:gap-4"],
      },
    ]);
  });
});
