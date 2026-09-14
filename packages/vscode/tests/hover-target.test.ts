import { describe, expect, it } from "vitest";
import { parseVariantGroupClassList } from "tailwind-variant-groups";
import type { ExtractedClassList } from "../src/class-lists.js";
import { findHoverTarget } from "../src/hover-target.js";

const text = "p-4 md:(bg-red-500 hover:(text-white underline))";
const documentStart = 17;
const lists: ExtractedClassList[] = [
  {
    text,
    range: { start: documentStart, end: documentStart + text.length },
    nodes: parseVariantGroupClassList(text),
  },
];

const at = (value: string, occurrence = 0): number => {
  let index = -1;
  for (let current = 0; current <= occurrence; current += 1) {
    index = text.indexOf(value, index + 1);
  }
  if (index < 0) throw new Error(`Missing test value: ${value}`);
  return documentStart + index;
};

describe("findHoverTarget", () => {
  it("returns an ordinary candidate with a document-absolute range", () => {
    expect(findHoverTarget(lists, at("p-4") + 1)).toEqual({
      kind: "candidate",
      range: { start: 17, end: 20 },
      candidates: ["p-4"],
    });
  });

  it("returns the effective inherited candidate for a grouped leaf", () => {
    const start = at("text-white");
    expect(findHoverTarget(lists, start + 2)).toEqual({
      kind: "candidate",
      range: { start, end: start + "text-white".length },
      candidates: ["md:hover:text-white"],
    });
  });

  it.each(["prefix", "open parenthesis", "close parenthesis"] as const)(
    "returns the nested subtree on its %s",
    (location) => {
      const groupStart = at("hover:");
      const openParen = groupStart + "hover:".length;
      const closeParen = at(")", 0);
      const offset =
        location === "prefix"
          ? groupStart + 1
          : location === "open parenthesis"
            ? openParen
            : closeParen;

      expect(findHoverTarget(lists, offset)).toEqual({
        kind: "group",
        range: { start: groupStart, end: closeParen + 1 },
        candidates: ["md:hover:text-white", "md:hover:underline"],
      });
    },
  );

  it.each(["prefix", "open parenthesis", "close parenthesis"] as const)(
    "returns the complete outer subtree on its %s",
    (location) => {
      const groupStart = at("md:");
      const openParen = groupStart + "md:".length;
      const closeParen = at(")", 1);
      const offset =
        location === "prefix"
          ? groupStart
          : location === "open parenthesis"
            ? openParen
            : closeParen;

      expect(findHoverTarget(lists, offset)).toEqual({
        kind: "group",
        range: { start: groupStart, end: closeParen + 1 },
        candidates: ["md:bg-red-500", "md:hover:text-white", "md:hover:underline"],
      });
    },
  );

  it("prefers a candidate over its enclosing group", () => {
    expect(findHoverTarget(lists, at("bg-red-500") + 3)?.kind).toBe("candidate");
  });

  it("returns no target for whitespace inside a group", () => {
    const whitespace = at(" hover:");
    expect(findHoverTarget(lists, whitespace)).toBeUndefined();
  });

  it("returns no target outside an extracted class list", () => {
    expect(findHoverTarget(lists, documentStart - 1)).toBeUndefined();
    expect(findHoverTarget(lists, documentStart + text.length)).toBeUndefined();
  });
});
