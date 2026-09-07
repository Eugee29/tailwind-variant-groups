import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  analyzeCandidateLists,
  assertSupportedTailwindVersion,
} from "../../src/tailwind/analyze.js";

const fixturesDirectory = path.dirname(
  fileURLToPath(new URL("../fixtures/tailwind.css", import.meta.url)),
);

async function writeThrowingPackage(
  root: string,
  packagePath: string,
  packageJson: object,
  entrypoint: string,
  message: string,
): Promise<void> {
  const directory = path.join(root, "node_modules", packagePath);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "package.json"), JSON.stringify(packageJson));
  await fs.writeFile(
    path.join(directory, entrypoint),
    `const error = new Error(${JSON.stringify(message)}); error.code = "MODULE_NOT_FOUND"; throw error;`,
  );
}

async function analyzeWithStylesheet(stylesheet: string) {
  return analyzeCandidateLists({
    stylesheet,
    lists: [["flex"]],
    options: { canonicalize: true, collapse: true, rootFontSize: 16 },
  });
}

describe("Tailwind dependency resolution", () => {
  it("rejects Tailwind 4.3 prereleases", () => {
    expect(() => assertSupportedTailwindVersion("4.3.0-alpha.1", "styles.css")).toThrow(
      /Tailwind CSS >=4\.3 <5 is required/,
    );
  });

  it("propagates project-local Tailwind Node initialization failures", async () => {
    const directory = await fs.mkdtemp(path.join(fixturesDirectory, "node-error-"));
    const stylesheet = path.join(directory, "styles.css");
    const message = "project-local @tailwindcss/node initialization failed";

    try {
      await fs.writeFile(stylesheet, "");
      await writeThrowingPackage(
        directory,
        path.join("@tailwindcss", "node"),
        { name: "@tailwindcss/node", version: "4.3.3", main: "index.cjs" },
        "index.cjs",
        message,
      );

      await expect(analyzeWithStylesheet(stylesheet)).rejects.toThrow(message);
    } finally {
      await fs.rm(directory, { force: true, recursive: true });
    }
  }, 30_000);

  it("propagates project-local Tailwind manifest initialization failures", async () => {
    const directory = await fs.mkdtemp(path.join(fixturesDirectory, "manifest-error-"));
    const stylesheet = path.join(directory, "styles.css");
    const message = "project-local Tailwind manifest initialization failed";

    try {
      await fs.writeFile(stylesheet, "");
      await writeThrowingPackage(
        directory,
        "tailwindcss",
        {
          name: "tailwindcss",
          version: "4.3.3",
          exports: { "./package.json": "./manifest.cjs" },
        },
        "manifest.cjs",
        message,
      );

      await expect(analyzeWithStylesheet(stylesheet)).rejects.toThrow(message);
    } finally {
      await fs.rm(directory, { force: true, recursive: true });
    }
  }, 30_000);
});
