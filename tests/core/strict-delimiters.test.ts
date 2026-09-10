import { describe, expect, it } from "vitest";
import { expandVariantGroupsInText } from "../../src/core/expand-text.js";

describe("opt-in class-list delimiter validation", () => {
  it.each([
    ["md:(flex))", 9],
    ["md:(flex gap-4)]", 15],
    ["md:(flex gap-4)}", 15],
    ["md:([flex)]", 9],
    ["md:((flex gap-4))", 4],
    ["md:(flex)hover:(gap-4)", 9],
    ["md:(flex [gap-4))", 15],
    ["md:(w-[8px)", 10],
    [")", 0],
    ["]", 0],
    ["}", 0],
  ] as const)("rejects %s at the offending character", (text, index) => {
    expect(() =>
      expandVariantGroupsInText(text, {
        validateDelimiters: true,
        source: "prefix\n" + text,
        offset: 7,
      }),
    ).toThrowError(
      expect.objectContaining({
        name: "VariantGroupSyntaxError",
        index: 7 + index,
        line: 2,
        column: index + 1,
      }),
    );
  });

  it.each([
    "md:(flex hover:(underline text-white))",
    "[&:is(button,a)]:(flex gap-4)",
    "md:(w-[calc(100%-2rem)] bg-(--brand))",
    "md:(content-[')_[}_]'] flex)",
    String.raw`md:(content-['a\'b)'] flex)`,
    String.raw`md:(custom\] flex)`,
  ])("preserves valid arbitrary syntax: %s", (text) => {
    expect(expandVariantGroupsInText(text, { validateDelimiters: true })).toEqual(
      expandVariantGroupsInText(text),
    );
  });

  it("preserves the existing runtime default and lenient behavior", () => {
    expect(expandVariantGroupsInText("md:(flex))").code).toBe("md:flex)");
    expect(expandVariantGroupsInText("md:(flex", { strict: false }).code).toBe(
      "md:(flex",
    );
  });
});
