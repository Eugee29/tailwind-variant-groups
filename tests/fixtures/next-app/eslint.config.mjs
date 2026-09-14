import { fileURLToPath } from "node:url";
import parser from "@typescript-eslint/parser";
import tailwindcss from "eslint-plugin-tailwindcss";
import variantGroups from "eslint-plugin-tailwind-variant-groups";

export default [
  tailwindcss.configs.recommended,
  variantGroups.configs["flat/compat-tailwindcss"],
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      "tailwind-variant-groups": {
        stylesheet: fileURLToPath(new URL("./app/globals.css", import.meta.url)),
        callees: ["cn", "clsx", "cva"],
        attributes: ["class", "className"],
      },
    },
  },
];
