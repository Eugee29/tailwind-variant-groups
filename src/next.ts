import { fileURLToPath, pathToFileURL } from "node:url";
import type { NextConfig } from "next";
import type { LoaderOptions } from "./loader.js";

export interface NextVariantGroupOptions {
  strict?: boolean;
}

type TurbopackRules = NonNullable<
  NonNullable<NextConfig["turbopack"]>["rules"]
>;

const moduleUrl =
  typeof __filename === "string"
    ? pathToFileURL(__filename).href
    : import.meta.url;
const loaderPath = fileURLToPath(new URL("./loader.cjs", moduleUrl));

export function withVariantGroups(
  nextConfig: NextConfig = {},
  options?: NextVariantGroupOptions,
): NextConfig {
  const strict = options?.strict ?? true;
  const loaderOptions = { strict } satisfies LoaderOptions &
    Record<string, boolean>;
  const { turbopack, webpack: userWebpack, ...rest } = nextConfig;
  const existingRules = turbopack?.rules ?? {};
  const existingStarRule = existingRules["*"];
  const turbopackRule = {
    condition: {
      all: [
        { not: "foreign" },
        {
          any: [
            { path: "*.js" },
            { path: "*.jsx" },
            { path: "*.ts" },
            { path: "*.tsx" },
          ],
        },
      ],
    },
    loaders: [{ loader: loaderPath, options: loaderOptions }],
  } satisfies TurbopackRules[string];
  const rules: TurbopackRules = {
    ...existingRules,
    "*": existingStarRule
      ? [
          turbopackRule,
          ...(Array.isArray(existingStarRule)
            ? existingStarRule
            : [existingStarRule]),
        ]
      : turbopackRule,
  };
  const webpack: NonNullable<NextConfig["webpack"]> = (config, context) => {
    const result = userWebpack?.(config, context) ?? config;
    const module = result.module ?? (result.module = {});
    const rules = module.rules ?? (module.rules = []);

    rules.unshift({
      enforce: "pre",
      test: /\.[jt]sx?$/,
      exclude: /node_modules/,
      use: [{ loader: loaderPath, options: loaderOptions }],
    });

    return result;
  };

  return {
    ...rest,
    turbopack: {
      ...turbopack,
      rules,
    },
    webpack,
  };
}
