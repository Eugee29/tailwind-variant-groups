declare function variantGroupLoader(
  this: LoaderContext,
  source: string,
  inputMap?: unknown,
): void;

declare namespace variantGroupLoader {
  interface LoaderOptions {
    strict?: boolean;
  }
}

interface LoaderContext {
  resourcePath: string;
  getOptions?: () => variantGroupLoader.LoaderOptions;
  query?: variantGroupLoader.LoaderOptions;
  cacheable?: (flag?: boolean) => void;
  callback: (error: Error | null, code?: string, map?: unknown) => void;
}

export = variantGroupLoader;
