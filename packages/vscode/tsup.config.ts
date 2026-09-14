import { existsSync } from "node:fs";
import { defineConfig } from "tsup";

const entries = Object.fromEntries(
  Object.entries({
    extension: "src/extension.ts",
    provider: "src/provider.ts",
  }).filter(([, filename]) => existsSync(filename)),
);

export default defineConfig({
  bundle: true,
  clean: true,
  dts: false,
  entry: entries,
  external: ["vscode"],
  format: ["cjs"],
  outExtension: () => ({ js: ".cjs" }),
  platform: "node",
  sourcemap: true,
  target: "node20",
  treeshake: true,
});
