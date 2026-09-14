import prettier from "prettier";
import { describe, expect, it } from "vitest";

describe("plain Prettier compatibility", () => {
  it("preserves grouped class contents without a Tailwind sorting plugin", async () => {
    const source =
      'const View = () => <div className="md:(flex gap-4 hover:(text-white))" />';
    const output = await prettier.format(source, { parser: "babel", plugins: [] });

    expect(output).toContain('className="md:(flex gap-4 hover:(text-white))"');
    expect(await prettier.format(output, { parser: "babel", plugins: [] })).toBe(
      output,
    );
  });
});
