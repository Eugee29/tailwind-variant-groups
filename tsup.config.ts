import { existsSync } from "node:fs";
import { defineConfig } from "tsup";

const shared = {
  bundle: true,
  platform: "node" as const,
  target: "node20" as const,
  sourcemap: true,
  treeshake: true,
};

const libraryEntries = Object.fromEntries(
  Object.entries({
    index: "src/index.ts",
    next: "src/next.ts",
    postcss: "src/postcss.ts",
  }).filter(([, file]) => existsSync(file)),
);

export default defineConfig([
  {
    ...shared,
    clean: true,
    dts: true,
    entry: libraryEntries,
    format: ["esm", "cjs"],
    outExtension({ format }) {
      return { js: format === "esm" ? ".js" : ".cjs" };
    },
  },
  {
    ...shared,
    clean: false,
    dts: true,
    entry: { loader: "src/loader.ts" },
    format: ["cjs"],
    outExtension() {
      return { js: ".cjs" };
    },
  },
]);
