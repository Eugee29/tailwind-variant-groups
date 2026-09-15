import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertSupportedTailwindVersion,
  createTailwindPreviewService,
} from "../src/tailwind-preview.js";

const fixture = path.resolve("tests/fixtures/tailwind.css");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("createTailwindPreviewService", () => {
  it("renders ordinary, responsive hover, and custom candidates with real Tailwind", async () => {
    const service = createTailwindPreviewService();
    const [spacing, responsiveHover, custom] = await service.candidatesToCss(fixture, [
      "p-4",
      "md:hover:bg-brand",
      "content-auto",
    ]);

    expect(spacing).toContain("padding: calc(var(--spacing) * 4)");
    expect(responsiveHover).toContain("@media (width >= 48rem)");
    expect(responsiveHover).toContain(".md\\:hover\\:bg-brand");
    expect(responsiveHover).toContain("background-color: var(--color-brand)");
    expect(custom).toContain("content-visibility: auto");
  });

  it("returns null for an unknown candidate", async () => {
    const service = createTailwindPreviewService();
    await expect(
      service.candidatesToCss(fixture, ["definitely-not-a-tailwind-candidate"]),
    ).resolves.toEqual([null]);
  });

  it("returns identical output from an unchanged cached stylesheet", async () => {
    const service = createTailwindPreviewService();
    const first = await service.candidatesToCss(fixture, ["bg-brand"]);
    const second = await service.candidatesToCss(fixture, ["bg-brand"]);
    expect(second).toEqual(first);
  });

  it("reloads changed CSS after invalidating one stylesheet", async () => {
    const directory = await fs.mkdtemp(path.join(path.dirname(fixture), "temporary-"));
    temporaryDirectories.push(directory);
    const stylesheet = path.join(directory, "input.css");
    await fs.writeFile(
      stylesheet,
      '@import "tailwindcss";\n@utility dynamic { color: #111111; }\n',
    );

    const service = createTailwindPreviewService();
    expect((await service.candidatesToCss(stylesheet, ["dynamic"]))[0]).toContain(
      "#111111",
    );

    await fs.writeFile(
      stylesheet,
      '@import "tailwindcss";\n@utility dynamic { color: #222222; }\n',
    );
    service.invalidate(stylesheet);

    expect((await service.candidatesToCss(stylesheet, ["dynamic"]))[0]).toContain(
      "#222222",
    );
  });
});

describe("assertSupportedTailwindVersion", () => {
  it("accepts stable Tailwind 4.3-4.x and rejects unsupported versions", () => {
    expect(() => assertSupportedTailwindVersion("4.3.0", fixture)).not.toThrow();
    expect(() => assertSupportedTailwindVersion("4.99.1", fixture)).not.toThrow();
    expect(() => assertSupportedTailwindVersion("4.2.9", fixture)).toThrow(
      "Tailwind CSS >=4.3 <5 is required",
    );
    expect(() => assertSupportedTailwindVersion("5.0.0", fixture)).toThrow(
      "Tailwind CSS >=4.3 <5 is required",
    );
    expect(() => assertSupportedTailwindVersion("4.3.0-beta.1", fixture)).toThrow(
      "Tailwind CSS >=4.3 <5 is required",
    );
  });
});
