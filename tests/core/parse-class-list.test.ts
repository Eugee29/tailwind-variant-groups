import { describe, expect, it } from "vitest";
import { parseVariantGroupClassList } from "../../src/core/parse-class-list.js";

describe("parseVariantGroupClassList", () => {
  it("returns nested groups, effective candidates, and exact ranges", () => {
    const text = "p-4 md:(bg-red-500 hover:(text-white underline))";

    expect(parseVariantGroupClassList(text)).toEqual([
      {
        kind: "candidate",
        raw: "p-4",
        candidate: "p-4",
        range: { start: 0, end: 3 },
      },
      {
        kind: "group",
        prefix: "md:",
        range: { start: 4, end: 48 },
        prefixRange: { start: 4, end: 7 },
        openParen: 7,
        closeParen: 47,
        candidates: ["md:bg-red-500", "md:hover:text-white", "md:hover:underline"],
        children: [
          {
            kind: "candidate",
            raw: "bg-red-500",
            candidate: "md:bg-red-500",
            range: { start: 8, end: 18 },
          },
          {
            kind: "group",
            prefix: "hover:",
            range: { start: 19, end: 47 },
            prefixRange: { start: 19, end: 25 },
            openParen: 25,
            closeParen: 46,
            candidates: ["md:hover:text-white", "md:hover:underline"],
            children: [
              {
                kind: "candidate",
                raw: "text-white",
                candidate: "md:hover:text-white",
                range: { start: 26, end: 36 },
              },
              {
                kind: "candidate",
                raw: "underline",
                candidate: "md:hover:underline",
                range: { start: 37, end: 46 },
              },
            ],
          },
        ],
      },
    ]);
  });

  it("uses JavaScript UTF-16 offsets and preserves multiline whitespace", () => {
    const nodes = parseVariantGroupClassList("😀\nmd:(\n  flex\n  gap-4\n)");
    const group = nodes[1];

    expect(group).toMatchObject({
      kind: "group",
      range: { start: 3, end: 24 },
      prefixRange: { start: 3, end: 6 },
      openParen: 6,
      closeParen: 23,
      candidates: ["md:flex", "md:gap-4"],
    });
  });

  it("keeps whitespace inside arbitrary values in one candidate", () => {
    const [group] = parseVariantGroupClassList(
      "md:(content-['hello world'] grid-cols-[1fr_2fr])",
    );

    expect(group).toMatchObject({
      kind: "group",
      candidates: ["md:content-['hello world']", "md:grid-cols-[1fr_2fr]"],
    });
  });

  it("retains duplicate candidates and empty groups", () => {
    const nodes = parseVariantGroupClassList("hover:(flex flex) md:()");

    expect(nodes).toMatchObject([
      { kind: "group", candidates: ["hover:flex", "hover:flex"] },
      { kind: "group", candidates: [], children: [] },
    ]);
  });

  it("reports an unterminated group in strict mode", () => {
    expect(() => parseVariantGroupClassList("md:(flex")).toThrowError(
      expect.objectContaining({ name: "VariantGroupSyntaxError", index: 3 }),
    );
  });

  it("treats an unterminated group as an ordinary candidate in lenient mode", () => {
    expect(parseVariantGroupClassList("md:(flex", { strict: false })).toEqual([
      {
        kind: "candidate",
        raw: "md:(flex",
        candidate: "md:(flex",
        range: { start: 0, end: 8 },
      },
    ]);
  });
});
