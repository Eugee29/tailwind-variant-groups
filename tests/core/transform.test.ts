import { describe, expect, it } from "vitest";
import { transformVariantGroups, VariantGroupSyntaxError } from "../../src/index.js";

describe("transformVariantGroups", () => {
  it("transforms static strings in TSX and leaves executable syntax alone", () => {
    const source = `
      import value from "md:(do not transform)";
      const matcher = /md:\\(flex gap-4\\)/;
      // md:(comment content)
      export const Page = () => (
        <div className="p-4 md:(flex gap-4 hover:(text-white))" />
      );
    `;

    const result = transformVariantGroups(source, { filename: "page.tsx" });

    expect(result.code).toContain(
      'className="p-4 md:flex md:gap-4 md:hover:text-white"',
    );
    expect(result.code).toContain('from "md:(do not transform)"');
    expect(result.code).toContain("// md:(comment content)");
    expect(result.candidates).toEqual(["md:flex", "md:gap-4", "md:hover:text-white"]);
    expect(result.map).not.toBeNull();
  });

  it("supports groups wholly contained in template segments", () => {
    const source = "const c = `base ${active ? 'on' : 'off'} md:(flex gap-4)`";
    expect(transformVariantGroups(source, { filename: "classes.ts" }).code).toContain(
      "md:flex md:gap-4",
    );
  });

  it("rejects a group that crosses template interpolation", () => {
    const source = "const c = `md:(bg-${color})`";
    expect(() =>
      transformVariantGroups(source, { filename: "/app/page.tsx" }),
    ).toThrowError(VariantGroupSyntaxError);
  });

  it("uses the marker fast path before parsing", () => {
    const invalidJavaScript = "const = ordinary-class";
    expect(transformVariantGroups(invalidJavaScript).code).toBe(invalidJavaScript);
  });

  it("is idempotent", () => {
    const once = transformVariantGroups('const c = "md:(flex gap-4)"');
    const twice = transformVariantGroups(once.code);
    expect(twice.code).toBe(once.code);
    expect(twice.changed).toBe(false);
  });
});
