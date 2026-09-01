import fs from "node:fs/promises";
import path from "node:path";
import fastGlob from "fast-glob";
import postcss, { type PluginCreator } from "postcss";
import { transformVariantGroups } from "./core/transform.js";

export interface PostcssVariantGroupOptions {
  base?: string;
  include?: string[];
  exclude?: string[];
  strict?: boolean;
}

interface CachedCandidates {
  mtimeMs: number;
  size: number;
  candidates: string[];
}

const DEFAULT_INCLUDE = ["**/*.{js,jsx,ts,tsx}"];
const DEFAULT_EXCLUDE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
];

const candidateCaches = new Map<boolean, Map<string, CachedCandidates>>();
const TAILWIND_IMPORT = /^\s*["']tailwindcss(?:["']|\s)/u;
const SUPPORTED_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

const variantGroups: PluginCreator<PostcssVariantGroupOptions> = (options = {}) => {
  const base = path.resolve(options.base ?? process.cwd());
  const include = options.include ?? DEFAULT_INCLUDE;
  const exclude = options.exclude ?? DEFAULT_EXCLUDE;
  const strict = options.strict ?? true;
  const candidateCache =
    candidateCaches.get(strict) ?? new Map<string, CachedCandidates>();
  candidateCaches.set(strict, candidateCache);

  return {
    postcssPlugin: "tailwind-variant-groups",
    async Once(root, { result }) {
      let tailwindImport: postcss.AtRule | undefined;
      root.walkAtRules("import", (atRule) => {
        if (TAILWIND_IMPORT.test(atRule.params)) {
          tailwindImport = atRule;
          return false;
        }
        return undefined;
      });
      if (tailwindImport === undefined) return;

      const files = (
        await fastGlob(include, {
          absolute: true,
          cwd: base,
          ignore: exclude,
          onlyFiles: true,
        })
      ).filter((filename) => SUPPORTED_EXTENSIONS.has(path.extname(filename)));
      const matchedFiles = new Set(files);
      for (const filename of candidateCache.keys()) {
        if (!matchedFiles.has(filename)) candidateCache.delete(filename);
      }

      const candidates = new Set<string>();
      for (const filename of files) {
        const stats = await fs.stat(filename);
        let cached = candidateCache.get(filename);
        if (cached?.mtimeMs !== stats.mtimeMs || cached.size !== stats.size) {
          const source = await fs.readFile(filename, "utf8");
          const transformed = transformVariantGroups(source, {
            filename,
            sourceMap: false,
            strict,
          });
          cached = {
            mtimeMs: stats.mtimeMs,
            size: stats.size,
            candidates: transformed.candidates,
          };
          candidateCache.set(filename, cached);
        }
        for (const candidate of cached?.candidates ?? []) candidates.add(candidate);
        result.messages.push({
          type: "dependency",
          plugin: "tailwind-variant-groups",
          file: filename,
        });
      }
      for (const glob of include) {
        result.messages.push({
          type: "dir-dependency",
          plugin: "tailwind-variant-groups",
          dir: base,
          glob,
        });
      }

      const sortedCandidates = [...candidates].sort((left, right) =>
        left.localeCompare(right),
      );
      if (sortedCandidates.length === 0) return;

      tailwindImport.parent?.insertAfter(
        tailwindImport,
        postcss.atRule({
          name: "source",
          params: `inline(${JSON.stringify(sortedCandidates.join(" "))})`,
        }),
      );
    },
  };
};

variantGroups.postcss = true;

export default variantGroups;
