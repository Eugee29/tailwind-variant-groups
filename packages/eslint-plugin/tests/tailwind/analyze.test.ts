import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  analyzeCandidateLists,
  assertSupportedTailwindVersion,
} from "../../src/tailwind/analyze.js";
import type { AnalyzeRequest } from "../../src/protocol.js";

const stylesheet = fileURLToPath(new URL("../fixtures/tailwind.css", import.meta.url));

function requestFor(stylesheet: string, candidates: string[]): AnalyzeRequest {
  return {
    stylesheet,
    lists: [candidates],
    options: { canonicalize: true, collapse: true, rootFontSize: 16 },
  };
}

describe("Tailwind candidate analysis", () => {
  it("canonicalizes, collapses, orders, and decomposes parsed candidates", async () => {
    const result = await analyzeCandidateLists({
      stylesheet,
      lists: [
        [
          "md:w-[8px]",
          "md:h-[8px]",
          "md:mt-2",
          "md:mb-2",
          "md:hover:bg-brand",
          "md:hover:text-white",
        ],
      ],
      options: { canonicalize: true, collapse: true, rootFontSize: 16 },
    });

    expect(result.lists[0]?.map((item) => item.raw)).toEqual([
      "md:size-2",
      "md:my-2",
      "md:hover:bg-brand",
      "md:hover:text-white",
    ]);
    expect(result.lists[0]?.[2]).toMatchObject({
      variants: ["md", "hover"],
      utility: "bg-brand",
      parsed: true,
    });
    expect(result.lists[0]?.every((item) => item.order !== null)).toBe(true);
  }, 30_000);

  it("preserves unknown candidates as opaque values", async () => {
    const result = await analyzeCandidateLists({
      stylesheet,
      lists: [["custom-card", "md:custom-card", "md:flex"]],
      options: { canonicalize: true, collapse: true, rootFontSize: 16 },
    });

    expect(result.lists[0]?.slice(0, 2)).toEqual([
      expect.objectContaining({ raw: "custom-card", parsed: false, order: null }),
      expect.objectContaining({ raw: "md:custom-card", parsed: false, order: null }),
    ]);
  });

  it.each(["4.2.4", "5.0.0"])("rejects unsupported Tailwind version %s", (version) => {
    expect(() => assertSupportedTailwindVersion(version, stylesheet)).toThrow(
      /Tailwind CSS >=4\.3 <5 is required/,
    );
  });

  it("includes the resolved stylesheet in loading failures", async () => {
    const missing = path.join(path.dirname(stylesheet), "missing.css");
    await expect(analyzeCandidateLists(requestFor(missing, ["flex"]))).rejects.toThrow(
      missing,
    );
  });

  it("reloads the design system when stylesheet metadata changes", async () => {
    const directory = await fs.mkdtemp(
      path.join(path.dirname(stylesheet), "cache-test-"),
    );
    const changingStylesheet = path.join(directory, "styles.css");

    try {
      await fs.writeFile(changingStylesheet, '@import "tailwindcss";');
      const before = await analyzeCandidateLists(
        requestFor(changingStylesheet, ["cache-card"]),
      );
      expect(before.lists[0]?.[0]?.parsed).toBe(false);

      await fs.writeFile(
        changingStylesheet,
        '@import "tailwindcss"; @utility cache-card { display: block; }',
      );
      const after = await analyzeCandidateLists(
        requestFor(changingStylesheet, ["cache-card"]),
      );
      expect(after.lists[0]?.[0]?.parsed).toBe(true);
    } finally {
      await fs.rm(directory, { force: true, recursive: true });
    }
  });
});
