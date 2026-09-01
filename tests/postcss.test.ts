import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import tailwindcss from "@tailwindcss/postcss";
import postcss from "postcss";
import { afterEach, describe, expect, it } from "vitest";
import variantGroups from "../src/postcss.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("PostCSS candidate bridge", () => {
  it("generates Tailwind CSS for expanded responsive and nested candidates", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "variant-groups-"));
    temporaryRoots.push(root);
    await fs.symlink(
      path.resolve("node_modules"),
      path.join(root, "node_modules"),
      "junction",
    );
    await fs.mkdir(path.join(root, "app"));
    await fs.writeFile(
      path.join(root, "app/page.tsx"),
      '<div className="md:(flex gap-4 hover:(text-white))" />',
    );

    const result = await postcss([
      variantGroups({ base: root }),
      tailwindcss({ base: root }),
    ]).process('@import "tailwindcss";', {
      from: path.join(root, "app.css"),
    });

    expect(result.css).toContain(".md\\:flex");
    expect(result.css).toContain(".md\\:gap-4");
    expect(result.css).toContain(".md\\:hover\\:text-white:hover");
    expect(result.css).toContain("@media");
  });

  it("does nothing for a stylesheet without a Tailwind import", async () => {
    const result = await postcss([variantGroups()]).process(".plain {}", {
      from: "plain.css",
    });
    expect(result.css).toBe(".plain {}");
  });

  it("honors globs, sorts candidates, and invalidates changed files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "variant-groups-"));
    temporaryRoots.push(root);
    await fs.mkdir(path.join(root, "app"));
    await fs.mkdir(path.join(root, "ignored"));
    const page = path.join(root, "app/page.tsx");
    await fs.writeFile(page, '<div className="xl:(grid) md:(flex)" />');
    await fs.writeFile(
      path.join(root, "ignored/other.tsx"),
      '<div className="lg:(hidden)" />',
    );

    const processBridge = () =>
      postcss([
        variantGroups({
          base: root,
          include: ["app/**/*.tsx"],
          exclude: ["ignored/**"],
        }),
      ]).process('@import "tailwindcss";', {
        from: path.join(root, "app.css"),
      });

    const first = await processBridge();
    expect(first.css.indexOf("md:flex")).toBeLessThan(first.css.indexOf("xl:grid"));
    expect(first.css).not.toContain("lg:hidden");

    await fs.writeFile(page, '<div className="2xl:(grid grid-cols-2 gap-8)" />');
    const second = await processBridge();
    expect(second.css).toContain("2xl:grid");
    expect(second.css).toContain("2xl:grid-cols-2");
    expect(second.css).not.toContain("md:flex");
  });

  it("reports the malformed source filename in strict mode", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "variant-groups-"));
    temporaryRoots.push(root);
    await fs.mkdir(path.join(root, "app"));
    const page = path.join(root, "app/page.tsx");
    await fs.writeFile(page, 'const c = "md:(flex"');

    await expect(
      postcss([variantGroups({ base: root })]).process('@import "tailwindcss";', {
        from: path.join(root, "app.css"),
      }),
    ).rejects.toThrow(/app[\\/]page\.tsx:1:\d+/);
  });
});
