import { describe, expect, it, vi } from "vitest";
import { withVariantGroups } from "../src/next.js";

describe("withVariantGroups", () => {
  it("prepends a non-foreign JS/TS Turbopack rule and preserves star rules", () => {
    const existing = { loaders: ["existing-loader"] };
    const config = withVariantGroups({
      turbopack: { rules: { "*": existing, "*.svg": { loaders: ["svg"] } } },
    });

    expect(config.turbopack?.rules?.["*.svg"]).toEqual({ loaders: ["svg"] });
    expect(config.turbopack?.rules?.["*"]).toEqual([
      expect.objectContaining({
        condition: expect.any(Object),
        loaders: [
          expect.objectContaining({
            loader: expect.stringMatching(/loader\.cjs$/),
            options: { strict: true },
          }),
        ],
      }),
      existing,
    ]);
  });

  it("adds a Webpack pre-loader to the config returned by the user callback", () => {
    const returned = { module: { rules: [] as unknown[] } };
    const userWebpack = vi.fn(() => returned);
    const wrapped = withVariantGroups({ webpack: userWebpack });
    const original = { module: { rules: [] as unknown[] } };

    const result = wrapped.webpack?.(original as never, {} as never);

    expect(userWebpack).toHaveBeenCalledWith(original, expect.anything());
    expect(result).toBe(returned);
    expect(returned.module.rules[0]).toMatchObject({
      enforce: "pre",
      test: expect.any(RegExp),
      exclude: expect.any(RegExp),
    });
  });
});
