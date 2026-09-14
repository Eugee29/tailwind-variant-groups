import { VariantGroupSyntaxError } from "./error.js";

export interface ParseClassListOptions {
  strict?: boolean;
  validateDelimiters?: boolean;
  filename?: string;
  source?: string;
  offset?: number;
  interpolationBoundary?: boolean;
}

export interface TextRange {
  start: number;
  end: number;
}

export interface ClassCandidateNode {
  kind: "candidate";
  raw: string;
  candidate: string;
  range: TextRange;
}

export interface VariantGroupNode {
  kind: "group";
  prefix: string;
  range: TextRange;
  prefixRange: TextRange;
  openParen: number;
  closeParen: number;
  children: ClassListNode[];
  candidates: string[];
}

export type ClassListNode = ClassCandidateNode | VariantGroupNode;

interface ParsedGroup {
  openParen: number;
  end: number;
  prefix: string;
}

interface Delimiter {
  character: string;
  index: number;
  group: boolean;
}

const OPEN_TO_CLOSE: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
};

const CLOSE_TO_OPEN: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{",
};

function isWhitespace(character: string | undefined): boolean {
  return character !== undefined && /\s/u.test(character);
}

function syntaxError(
  message: string,
  index: number,
  text: string,
  options: ParseClassListOptions,
): never {
  throw new VariantGroupSyntaxError(message, index, {
    filename: options.filename,
    source: options.source ?? text,
    offset: options.offset,
  });
}

function validateDelimiters(text: string, options: ParseClassListOptions): void {
  const stack: Delimiter[] = [];
  let quote: string | undefined;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (
      (character === '"' || character === "'" || character === "`") &&
      stack.some((item) => !item.group)
    ) {
      quote = character;
      continue;
    }

    if (OPEN_TO_CLOSE[character] !== undefined) {
      const parent = stack.at(-1);
      if (
        character === "(" &&
        parent?.group &&
        (index === parent.index + 1 || isWhitespace(text[index - 1]))
      ) {
        syntaxError(
          "Nested variant groups require a variant prefix",
          index,
          text,
          options,
        );
      }
      stack.push({
        character,
        index,
        group:
          character === "(" &&
          text[index - 1] === ":" &&
          stack.every((item) => item.group),
      });
      continue;
    }

    const expectedOpen = CLOSE_TO_OPEN[character];
    if (expectedOpen !== undefined) {
      const opener = stack.pop();
      if (!opener || opener.character !== expectedOpen) {
        syntaxError(`Unmatched closing delimiter '${character}'`, index, text, options);
      }
      const next = text[index + 1];
      if (
        opener.group &&
        next !== undefined &&
        !isWhitespace(next) &&
        CLOSE_TO_OPEN[next] === undefined
      ) {
        syntaxError(
          "Variant groups must be separated by whitespace",
          index + 1,
          text,
          options,
        );
      }
    }
  }

  const opener = stack.at(-1);
  if (opener) {
    syntaxError(
      opener.group
        ? options.interpolationBoundary
          ? "Variant groups cannot cross a template interpolation"
          : "Unterminated variant group"
        : `Unterminated delimiter '${opener.character}'`,
      opener.index,
      text,
      options,
    );
  }
}

function findGroupOpener(text: string, start: number, limit: number): number {
  const stack: string[] = [];
  let quote: string | undefined;
  let escaped = false;

  for (let index = start; index < limit - 1; index += 1) {
    const character = text[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (
      (character === '"' || character === "'" || character === "`") &&
      stack.length > 0
    ) {
      quote = character;
      continue;
    }

    const expectedClose = OPEN_TO_CLOSE[character];
    if (expectedClose !== undefined) {
      stack.push(character);
      continue;
    }
    if (CLOSE_TO_OPEN[character] !== undefined) {
      if (stack.at(-1) !== CLOSE_TO_OPEN[character]) return -1;
      stack.pop();
      continue;
    }
    if (isWhitespace(character) && stack.length === 0) return -1;
    if (character === ":" && text[index + 1] === "(" && stack.length === 0) {
      return index + 1;
    }
  }

  return -1;
}

function findGroupEnd(text: string, openParen: number, limit: number): number {
  const stack: string[] = ["("];
  let quote: string | undefined;
  let escaped = false;

  for (let index = openParen + 1; index < limit; index += 1) {
    const character = text[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (OPEN_TO_CLOSE[character] !== undefined) {
      stack.push(character);
      continue;
    }

    const expectedOpen = CLOSE_TO_OPEN[character];
    if (expectedOpen !== undefined) {
      if (stack.at(-1) !== expectedOpen) return -1;
      stack.pop();
      if (stack.length === 0) return index;
    }
  }

  return -1;
}

function tryParseGroup(text: string, start: number, limit: number): ParsedGroup | null {
  const openParen = findGroupOpener(text, start, limit);
  if (openParen < 0) return null;
  const prefix = text.slice(start, openParen);
  if (!prefix.endsWith(":")) return null;
  return {
    openParen,
    end: findGroupEnd(text, openParen, limit),
    prefix,
  };
}

function findTokenEnd(text: string, start: number, limit: number): number {
  const stack: { character: string; group: boolean }[] = [];
  let quote: string | undefined;
  let escaped = false;

  for (let index = start; index < limit; index += 1) {
    const character = text[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (
      (character === '"' || character === "'" || character === "`") &&
      stack.some((item) => !item.group)
    ) {
      quote = character;
      continue;
    }
    if (OPEN_TO_CLOSE[character] !== undefined) {
      stack.push({
        character,
        group:
          character === "(" &&
          text[index - 1] === ":" &&
          stack.every((item) => item.group),
      });
      continue;
    }
    if (CLOSE_TO_OPEN[character] !== undefined) {
      if (stack.at(-1)?.character === CLOSE_TO_OPEN[character]) stack.pop();
      continue;
    }
    if (isWhitespace(character) && stack.length === 0) return index;
  }

  return limit;
}

export function splitTopLevelUtilityRanges(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    while (cursor < text.length && isWhitespace(text[cursor])) cursor += 1;
    if (cursor >= text.length) break;
    const end = findTokenEnd(text, cursor, text.length);
    ranges.push({ start: cursor, end });
    cursor = end;
  }

  return ranges;
}

function flattenCandidates(nodes: readonly ClassListNode[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === "candidate" ? [node.candidate] : node.candidates,
  );
}

function parseSequence(
  text: string,
  start: number,
  end: number,
  inheritedPrefix: string,
  options: ParseClassListOptions,
): ClassListNode[] {
  const nodes: ClassListNode[] = [];
  let cursor = start;

  while (cursor < end) {
    while (cursor < end && isWhitespace(text[cursor])) cursor += 1;
    if (cursor >= end) break;

    const parsed = tryParseGroup(text, cursor, end);
    if (parsed) {
      if (parsed.end < 0) {
        if (options.strict ?? true) {
          syntaxError(
            options.interpolationBoundary
              ? "Variant groups cannot cross a template interpolation"
              : "Unterminated variant group",
            cursor + parsed.prefix.length,
            text,
            options,
          );
        }
      } else {
        const children = parseSequence(
          text,
          parsed.openParen + 1,
          parsed.end,
          inheritedPrefix + parsed.prefix,
          options,
        );
        nodes.push({
          kind: "group",
          prefix: parsed.prefix,
          range: { start: cursor, end: parsed.end + 1 },
          prefixRange: { start: cursor, end: parsed.openParen },
          openParen: parsed.openParen,
          closeParen: parsed.end,
          children,
          candidates: flattenCandidates(children),
        });
        cursor = parsed.end + 1;
        continue;
      }
    }

    const tokenEnd = findTokenEnd(text, cursor, end);
    const raw = text.slice(cursor, tokenEnd);
    nodes.push({
      kind: "candidate",
      raw,
      candidate: inheritedPrefix + raw,
      range: { start: cursor, end: tokenEnd },
    });
    cursor = tokenEnd;
  }

  return nodes;
}

export function parseVariantGroupClassList(
  text: string,
  options: ParseClassListOptions = {},
): ClassListNode[] {
  if (options.validateDelimiters && (options.strict ?? true)) {
    validateDelimiters(text, options);
  }
  return parseSequence(text, 0, text.length, "", options);
}
