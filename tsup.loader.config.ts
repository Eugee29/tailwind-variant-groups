import { defineConfig } from "tsup";

export default defineConfig({
  bundle: true,
  clean: false,
  dts: true,
  entry: { loader: "src/loader.ts" },
  format: ["cjs"],
  platform: "node",
  sourcemap: true,
  target: "node20",
  treeshake: true,
  outExtension() {
    return { js: ".cjs" };
  },
});
