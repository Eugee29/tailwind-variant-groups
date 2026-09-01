import { describe, expect, it } from "vitest";
import { expandVariantGroupsInText } from "../../src/core/expand-text.js";

describe("expandVariantGroupsInText", () => {
  it.each([
    ["md:(flex gap-4)", "md:flex md:gap-4"],
    ["md:hover:(bg-blue-500 text-white)", "md:hover:bg-blue-500 md:hover:text-white"],
    [
      "md:(flex hover:(underline text-blue-500))",
      "md:flex md:hover:underline md:hover:text-blue-500",
    ],
    [
      "[&>svg]:(size-5 fill-current) md:(grid grid-cols-[1fr_2fr])",
      "[&>svg]:size-5 [&>svg]:fill-current md:grid md:grid-cols-[1fr_2fr]",
    ],
    ["font-(bold mono)", "font-(bold mono)"],
  ])("expands %s", (input, expected) => {
    expect(expandVariantGroupsInText(input).code).toBe(expected);
  });

  it("collects only expanded leaf candidates", () => {
    expect(expandVariantGroupsInText("p-4 md:(flex gap-4)").candidates).toEqual([
      "md:flex",
      "md:gap-4",
    ]);
  });

  it("reports malformed syntax at its source location", () => {
    expect(() =>
      expandVariantGroupsInText("before\nmd:(flex", {
        filename: "/app/page.tsx",
      }),
    ).toThrowError(
      expect.objectContaining({
        name: "VariantGroupSyntaxError",
        filename: "/app/page.tsx",
        line: 2,
        column: 4,
      }),
    );
  });

  it("leaves malformed syntax unchanged when strict is false", () => {
    expect(expandVariantGroupsInText("md:(flex", { strict: false }).code).toBe(
      "md:(flex",
    );
  });
});
