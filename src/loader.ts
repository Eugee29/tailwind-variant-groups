import { transformVariantGroups } from "./core/transform.js";

export interface LoaderOptions {
  strict?: boolean;
}

interface LoaderContext {
  resourcePath: string;
  getOptions?: () => LoaderOptions;
  query?: LoaderOptions;
  cacheable?: (flag?: boolean) => void;
  callback: (error: Error | null, code?: string, map?: unknown) => void;
}

export default function variantGroupLoader(
  this: LoaderContext,
  source: string,
  inputMap?: unknown,
): void {
  this.cacheable?.(true);

  try {
    const options = this.getOptions?.() ?? this.query ?? {};
    const result = transformVariantGroups(source, {
      filename: this.resourcePath,
      sourceMap: true,
      ...(options.strict === undefined ? {} : { strict: options.strict }),
    });

    this.callback(
      null,
      result.changed ? result.code : source,
      result.changed ? result.map : inputMap,
    );
  } catch (value: unknown) {
    const error = value instanceof Error ? value : new Error(String(value));
    this.callback(error);
  }
}
