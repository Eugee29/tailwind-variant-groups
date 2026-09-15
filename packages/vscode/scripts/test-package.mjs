import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const vsce = require.resolve("@vscode/vsce/vsce");
const packageMetadata = JSON.parse(
  await fs.readFile(path.join(packageRoot, "package.json"), "utf8"),
);

if (packageMetadata.icon !== "assets/icon.png") {
  throw new Error("VS Code extension manifest is missing assets/icon.png");
}

const listed = execFileSync(process.execPath, [vsce, "ls", "--no-dependencies"], {
  cwd: packageRoot,
  encoding: "utf8",
})
  .split(/\r?\n/u)
  .map((line) => line.trim().replaceAll("\\", "/"))
  .filter(Boolean);

for (const required of [
  "assets/icon.png",
  "dist/extension.cjs",
  "package.json",
  "README.md",
]) {
  if (!listed.includes(required)) {
    throw new Error(`VSIX file list is missing ${required}`);
  }
}

for (const forbidden of ["src/", "tests/", "scripts/"]) {
  if (listed.some((filename) => filename.startsWith(forbidden))) {
    throw new Error(`VSIX file list includes development path ${forbidden}`);
  }
}

const provider = await import(
  pathToFileURL(path.join(packageRoot, "dist/provider.cjs")).href
);
const preview = provider.createTailwindPreviewService();
const core = provider.createHoverProviderCore(preview);
const source =
  'export const view = <div className="md:(bg-red-500 hover:(text-white))" />;';
const temporaryWorkspace = await fs.mkdtemp(
  path.join(os.tmpdir(), "tailwind-variant-groups-vsix-"),
);

try {
  const tailwindPackage = path.dirname(require.resolve("tailwindcss/package.json"));
  const installedTailwind = path.join(
    temporaryWorkspace,
    "node_modules",
    "tailwindcss",
  );
  await fs.mkdir(path.dirname(installedTailwind), { recursive: true });
  await fs.cp(tailwindPackage, installedTailwind, { recursive: true });
  await fs.writeFile(
    path.join(temporaryWorkspace, "input.css"),
    '@import "tailwindcss";\n',
  );

  const hover = await core.provideHover({
    uri: "file:///package-smoke.tsx",
    filename: "package-smoke.tsx",
    version: 1,
    source,
    documentOffset: source.indexOf("text-white") + 1,
    workspaceFolder: temporaryWorkspace,
    settings: {
      hovers: true,
      stylesheet: "./input.css",
      attributes: ["class", "className"],
      callees: ["cn", "clsx", "cva"],
    },
    isCancellationRequested: () => false,
  });

  if (
    !hover?.markdown.includes("md:hover:text-white") ||
    !hover.markdown.includes("@media (width >= 48rem)")
  ) {
    throw new Error("Compiled provider did not render a real grouped Tailwind hover");
  }
} finally {
  await fs.rm(temporaryWorkspace, { recursive: true, force: true });
}

console.log("VSIX contents and compiled provider smoke test passed");
