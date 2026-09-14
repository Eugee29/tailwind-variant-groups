import { describe, expect, it } from "vitest";
import { serializeVariantGroups, sortAnalyzedCandidates } from "../src/formatter.js";
import type { AnalyzedCandidate } from "../src/protocol.js";

function candidate(
  raw: string,
  variants: string[],
  utility: string,
  order: string | null,
  sourceIndex: number,
  parsed = true,
): AnalyzedCandidate {
  return { raw, variants, utility, order, sourceIndex, parsed };
}

describe("pure candidate formatter", () => {
  it("sorts unknowns stably before ordered Tailwind candidates", () => {
    const values = [
      candidate("md:gap-4", ["md"], "gap-4", "2", 0),
      candidate("custom-a", [], "custom-a", null, 1, false),
      candidate("md:flex", ["md"], "flex", "1", 2),
      candidate("custom-b", [], "custom-b", null, 3, false),
    ];

    expect(sortAnalyzedCandidates(values).map((item) => item.raw)).toEqual([
      "custom-a",
      "custom-b",
      "md:flex",
      "md:gap-4",
    ]);
  });

  it("groups repeated contiguous prefixes and avoids single-child groups", () => {
    const values = [
      candidate("p-4", [], "p-4", "0", 0),
      candidate("md:size-2", ["md"], "size-2", "1", 1),
      candidate("md:my-2", ["md"], "my-2", "2", 2),
      candidate("md:hover:bg-red-500", ["md", "hover"], "bg-red-500", "3", 3),
      candidate("md:hover:text-white", ["md", "hover"], "text-white", "4", 4),
    ];

    expect(serializeVariantGroups(values, { sort: false, group: true })).toBe(
      "p-4 md:(size-2 my-2 hover:(bg-red-500 text-white))",
    );
  });

  it("keeps a one-item nested prefix inline and treats opaque items as boundaries", () => {
    const values = [
      candidate("md:flex", ["md"], "flex", "1", 0),
      candidate("md:hover:bg-red-500", ["md", "hover"], "bg-red-500", "2", 1),
      candidate("md:custom", [], "md:custom", null, 2, false),
      candidate("lg:grid", ["lg"], "grid", "3", 3),
      candidate("lg:gap-4", ["lg"], "gap-4", "4", 4),
    ];

    expect(serializeVariantGroups(values, { sort: false, group: true })).toBe(
      "md:(flex hover:bg-red-500) md:custom lg:(grid gap-4)",
    );
  });
});
