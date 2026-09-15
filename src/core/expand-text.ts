import {
  parseVariantGroupClassList,
  splitTopLevelUtilityRanges,
  type ClassListNode,
  type ParseClassListOptions,
} from "./parse-class-list.js";

export interface ExpandTextOptions extends ParseClassListOptions {}

export interface TextExpansion {
  code: string;
  candidates: string[];
  changed: boolean;
}

function expandedNode(node: ClassListNode, text: string): string {
  if (node.kind === "group" && node.candidates.length > 0) {
    return node.candidates.join(" ");
  }
  return text.slice(node.range.start, node.range.end);
}

export function expandVariantGroupsInText(
  text: string,
  options: ExpandTextOptions = {},
): TextExpansion {
  const nodes = parseVariantGroupClassList(text, options);
  const output: string[] = [];
  const candidates: string[] = [];
  let changed = false;
  let cursor = 0;

  for (const node of nodes) {
    output.push(text.slice(cursor, node.range.start));
    output.push(expandedNode(node, text));
    if (node.kind === "group" && node.candidates.length > 0) {
      candidates.push(...node.candidates);
      changed = true;
    }
    cursor = node.range.end;
  }
  output.push(text.slice(cursor));

  return {
    code: output.join(""),
    candidates: [...new Set(candidates)],
    changed,
  };
}

export function splitTopLevelUtilities(text: string): string[] {
  return splitTopLevelUtilityRanges(text).map(({ start, end }) =>
    text.slice(start, end),
  );
}
