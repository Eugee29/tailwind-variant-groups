import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { analyzeCandidateLists } from "../../src/tailwind/analyze.js";

const fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url));

describe("framework imports and uncertain dependency caching", () => {
  it.each([
    {
      name: "bare framework import",
      css: '@import "tailwindcss";',
      candidate: "md:flex",
      cached: true,
    },
    {
      name: "single-quoted prefixed framework import",
      css: "@import 'tailwindcss' prefix(acme);",
      candidate: "acme:md:flex",
      cached: true,
    },
    {
      name: "framework import with options",
      css: '@import "tailwindcss" layer(utilities) prefix(acme) source(none);',
      candidate: "acme:md:flex",
      cached: true,
    },
    {
      name: "relative imported theme",
      css: '@import "tailwindcss"; @import "./theme.css";',
      candidate: "md:flex",
      cached: false,
    },
    {
      name: "absolute imported theme",
      css: '@import "tailwindcss"; @import "ABSOLUTE_THEME";',
      candidate: "md:flex",
      cached: false,
    },
    {
      name: "non-framework package theme",
      css: '@import "tailwindcss"; @import "fixture-theme";',
      candidate: "md:flex",
      cached: false,
    },
    {
      name: "framework subpath",
      css: '@import "tailwindcss"; @import "tailwindcss/theme.css";',
      candidate: "md:flex",
      cached: false,
    },
    {
      name: "reference directive",
      css: '@import "tailwindcss"; @reference "./theme.css";',
      candidate: "md:flex",
      cached: false,
    },
    {
      name: "config directive",
      css: '@import "tailwindcss"; @config "./config.cjs";',
      candidate: "md:flex",
      cached: false,
    },
    {
      name: "plugin directive",
      css: '@import "tailwindcss"; @plugin "./plugin.cjs";',
      candidate: "md:flex",
      cached: false,
    },
    {
      name: "framework import with ambiguous comment syntax",
      css: '@import/* keep */ "tailwindcss";',
      candidate: "md:flex",
      cached: false,
    },
  ])(
    "$name: cache=$cached",
    async ({ css, candidate, cached }) => {
      const directory = await fs.mkdtemp(path.join(fixtures, "framework-cache-"));
      const stylesheet = path.join(directory, "styles.css");
      const theme = path.join(directory, "theme.css");
      const packageDirectory = path.join(directory, "node_modules/fixture-theme");
      const reads = vi.spyOn(fs, "readFile");
      try {
        await fs.mkdir(packageDirectory, { recursive: true });
        await fs.writeFile(
          path.join(packageDirectory, "package.json"),
          JSON.stringify({ name: "fixture-theme", style: "theme.css" }),
        );
        await fs.writeFile(
          path.join(packageDirectory, "theme.css"),
          "@theme { --color-cache: #123456; }",
        );
        await fs.writeFile(theme, "@theme { --color-cache: #123456; }");
        await fs.writeFile(path.join(directory, "config.cjs"), "module.exports = {};");
        await fs.writeFile(
          path.join(directory, "plugin.cjs"),
          "module.exports = function () {};",
        );
        await fs.writeFile(
          stylesheet,
          css.replace("ABSOLUTE_THEME", theme.replaceAll("\\", "/")),
        );
        const request = {
          stylesheet,
          lists: [[candidate]],
          options: { canonicalize: false, collapse: false, rootFontSize: 16 },
        };
        const before = await analyzeCandidateLists(request);
        expect(before.lists[0]![0]).toMatchObject({ raw: candidate, parsed: true });
        reads.mockClear();
        expect(await analyzeCandidateLists(request)).toEqual(before);
        const readPaths = reads.mock.calls.map(([file]) => String(file));
        if (cached) {
          // Reading the entry remains mandatory; stable framework files do not reload.
          expect(readPaths).toEqual([stylesheet]);
        } else {
          expect(readPaths).toContain(stylesheet);
          expect(readPaths.some((file) => file !== stylesheet)).toBe(true);
        }
      } finally {
        reads.mockRestore();
        await fs.rm(directory, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
