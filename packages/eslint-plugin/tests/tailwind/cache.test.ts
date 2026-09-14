import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeCandidateLists } from "../../src/tailwind/analyze.js";

const fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url));
const analyze = (stylesheet: string) =>
  analyzeCandidateLists({
    stylesheet,
    lists: [["w-[8px]", "cache-card"]],
    options: { canonicalize: true, collapse: true, rootFontSize: 16 },
  });

describe("design-system dependency freshness", () => {
  it("reloads an imported theme without touching the entry stylesheet", async () => {
    const directory = await fs.mkdtemp(path.join(fixtures, "import-cache-"));
    const stylesheet = path.join(directory, "styles.css");
    const theme = path.join(directory, "theme.css");
    try {
      await fs.writeFile(stylesheet, '@import "tailwindcss"; @import "./theme.css";');
      await fs.writeFile(theme, "@theme { --spacing: 0.25rem; }");
      const metadata = await fs.stat(stylesheet);
      const before = await analyze(stylesheet);
      expect(before.lists[0]!.map((candidate) => candidate.raw)).toEqual([
        "w-2",
        "cache-card",
      ]);
      expect(before.lists[0]![1]!.parsed).toBe(false);
      await fs.writeFile(
        theme,
        "@theme { --spacing: 0.5rem; } @utility cache-card { display: block; }",
      );
      const after = await analyze(stylesheet);
      expect(after.lists[0]!.map((candidate) => candidate.raw)).toEqual([
        "w-1",
        "cache-card",
      ]);
      expect(after.lists[0]![1]!.parsed).toBe(true);
      expect((await fs.stat(stylesheet)).mtimeMs).toBe(metadata.mtimeMs);
      expect((await fs.stat(stylesheet)).size).toBe(metadata.size);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("does not use a cached result after deletion and recovers after replacing the missing import", async () => {
    const directory = await fs.mkdtemp(path.join(fixtures, "deleted-cache-"));
    const stylesheet = path.join(directory, "styles.css");
    const theme = path.join(directory, "theme.css");
    try {
      await fs.writeFile(stylesheet, '@import "tailwindcss"; @import "./theme.css";');
      await fs.writeFile(theme, "@theme { --spacing: 0.25rem; }");
      expect((await analyze(stylesheet)).lists[0]![0]!.raw).toBe("w-2");
      await fs.unlink(theme);
      await expect(analyze(stylesheet)).rejects.toThrow(stylesheet);
      await expect(analyze(stylesheet)).rejects.toThrow(/theme\.css/);
      // Tailwind's resolver may cache the missing path independently for 4s.
      // Correct to a new import to prove our analyzer does not cache the error.
      await fs.writeFile(
        path.join(directory, "replacement.css"),
        "@theme { --spacing: 0.5rem; }",
      );
      await fs.writeFile(
        stylesheet,
        '@import "tailwindcss"; @import "./replacement.css";',
      );
      expect((await analyze(stylesheet)).lists[0]![0]!.raw).toBe("w-1");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("checks self-contained stylesheet content even when size and timestamp are preserved", async () => {
    const directory = await fs.mkdtemp(path.join(fixtures, "inline-cache-"));
    const stylesheet = path.join(directory, "styles.css");
    try {
      await fs.writeFile(stylesheet, "@theme { --spacing: 0.5rem; }");
      await fs.utimes(stylesheet, new Date(0), new Date(0));
      const metadata = await fs.stat(stylesheet);
      expect((await analyze(stylesheet)).lists[0]![0]!.raw).toBe("w-1");
      await fs.writeFile(stylesheet, "@theme { --spacing: 1.0rem; }");
      await fs.utimes(stylesheet, metadata.atime, metadata.mtime);
      expect((await analyze(stylesheet)).lists[0]![0]!.raw).toBe("w-0.5");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
