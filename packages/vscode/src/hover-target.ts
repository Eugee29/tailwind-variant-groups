import type {
  ClassListNode,
  TextRange,
  VariantGroupNode,
} from "tailwind-variant-groups";
import type { ExtractedClassList } from "./class-lists.js";

export interface CandidateHoverTarget {
  kind: "candidate";
  range: TextRange;
  candidates: [string];
}

export interface GroupHoverTarget {
  kind: "group";
  range: TextRange;
  candidates: string[];
}

export type HoverTarget = CandidateHoverTarget | GroupHoverTarget;

function contains(range: TextRange, offset: number): boolean {
  return offset >= range.start && offset < range.end;
}

function documentRange(range: TextRange, listStart: number): TextRange {
  return {
    start: listStart + range.start,
    end: listStart + range.end,
  };
}

function isGroupControl(group: VariantGroupNode, offset: number): boolean {
  return (
    contains(group.prefixRange, offset) ||
    offset === group.openParen ||
    offset === group.closeParen
  );
}

function findInNodes(
  nodes: readonly ClassListNode[],
  relativeOffset: number,
  listStart: number,
): HoverTarget | undefined {
  for (const node of nodes) {
    if (!contains(node.range, relativeOffset)) continue;

    if (node.kind === "candidate") {
      return {
        kind: "candidate",
        range: documentRange(node.range, listStart),
        candidates: [node.candidate],
      };
    }

    const nested = findInNodes(node.children, relativeOffset, listStart);
    if (nested) return nested;

    if (isGroupControl(node, relativeOffset)) {
      return {
        kind: "group",
        range: documentRange(node.range, listStart),
        candidates: [...node.candidates],
      };
    }
  }

  return undefined;
}

export function findHoverTarget(
  lists: readonly ExtractedClassList[],
  documentOffset: number,
): HoverTarget | undefined {
  for (const list of lists) {
    if (!contains(list.range, documentOffset)) continue;
    return findInNodes(list.nodes, documentOffset - list.range.start, list.range.start);
  }

  return undefined;
}
