import type { Plugin } from "postcss";

declare function variantGroups(
  options?: variantGroups.PostcssVariantGroupOptions,
): Plugin;

declare namespace variantGroups {
  interface PostcssVariantGroupOptions {
    base?: string;
    include?: string[];
    exclude?: string[];
    strict?: boolean;
  }

  const postcss: true;
}

export = variantGroups;
