import MagicString, { type SourceMap } from "magic-string";
import { expandVariantGroupsInText } from "./expand-text.js";
import { findStaticRanges } from "./static-ranges.js";

export interface TransformOptions {
  filename?: string;
  strict?: boolean;
  sourceMap?: boolean;
}

export interface TransformResult {
  code: string;
  candidates: string[];
  changed: boolean;
  map: SourceMap | null;
}

export function transformVariantGroups(
  source: string,
  options: TransformOptions = {},
): TransformResult {
  if (!source.includes(":(")) {
    return { code: source, candidates: [], changed: false, map: null };
  }

  const filename = options.filename ?? "source.js";
  const magicString = new MagicString(source);
  const candidates: string[] = [];
  let changed = false;

  for (const range of findStaticRanges(source, filename)) {
    const expansion = expandVariantGroupsInText(source.slice(range.start, range.end), {
      filename,
      source,
      offset: range.start,
      interpolationBoundary: range.interpolationAfter,
      ...(options.strict === undefined ? {} : { strict: options.strict }),
    });

    if (!expansion.changed) continue;

    magicString.overwrite(range.start, range.end, expansion.code);
    candidates.push(...expansion.candidates);
    changed = true;
  }

  return {
    code: changed ? magicString.toString() : source,
    candidates: [...new Set(candidates)],
    changed,
    map:
      options.sourceMap !== false
        ? magicString.generateMap({
            hires: true,
            source: filename,
            includeContent: true,
          })
        : null,
  };
}
