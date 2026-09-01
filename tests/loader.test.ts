import { describe, expect, it, vi } from "vitest";
import loader from "../src/loader.js";

function runLoader(source: string, strict = true, inputMap: unknown = null) {
  const callback = vi.fn();
  const cacheable = vi.fn();
  loader.call(
    {
      resourcePath: "/app/page.tsx",
      getOptions: () => ({ strict }),
      callback,
      cacheable,
    },
    source,
    inputMap,
  );
  return { callback, cacheable };
}

describe("variant group loader", () => {
  it("returns transformed code and a source map", () => {
    const { callback, cacheable } = runLoader(
      'export default <div className="md:(flex gap-4)" />',
    );
    expect(cacheable).toHaveBeenCalledWith(true);
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.stringContaining("md:flex md:gap-4"),
      expect.any(Object),
    );
  });

  it("preserves the incoming map on the unchanged fast path", () => {
    const inputMap = { version: 3 };
    const { callback } = runLoader('const c = "flex"', true, inputMap);
    expect(callback).toHaveBeenCalledWith(null, 'const c = "flex"', inputMap);
  });

  it("passes syntax errors to the bundler callback", () => {
    const { callback } = runLoader('const c = "md:(flex"');
    expect(callback.mock.calls[0]?.[0]).toMatchObject({
      name: "VariantGroupSyntaxError",
      filename: "/app/page.tsx",
    });
  });
});
