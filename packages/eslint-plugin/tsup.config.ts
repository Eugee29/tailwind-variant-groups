import { defineConfig } from "tsup";

export default defineConfig({
  bundle: true,
  clean: true,
  dts: false,
  entry: {
    client: "src/tailwind/client.ts",
    worker: "src/tailwind/worker.ts",
  },
  format: ["esm", "cjs"],
  outExtension({ format }) {
    return { js: format === "esm" ? ".js" : ".cjs" };
  },
  platform: "node",
  sourcemap: true,
  target: "node20",
  treeshake: true,
});
