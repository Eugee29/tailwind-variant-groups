import { VariantGroupSyntaxError } from "./error.js";

export interface ExpandTextOptions {
  strict?: boolean;
  /** Validate complete class-list delimiters; opt in to preserve runtime compatibility. */
  validateDelimiters?: boolean;
  filename?: string;
  source?: string;
  offset?: number;
  interpolationBoundary?: boolean;
}

export interface TextExpansion {
  code: string;
  candidates: string[];
  changed: boolean;
}

interface ParsedGroup {
  end: number;
  prefix: string;
  body: string;
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

function validateDelimiters(text: string, options: ExpandTextOptions): void {
  const stack: { character: string; index: number; group: boolean }[] = [];
  let quote: string | undefined;
  let escaped = false;
  const fail = (message: string, index: number): never => {
    throw new VariantGroupSyntaxError(message, index, {
      filename: options.filename,
      source: options.source ?? text,
      offset: options.offset,
    });
  };

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
    // Ordinary class names (including group bodies) may contain apostrophes.
    // Quotes protect delimiters only inside arbitrary values or functions.
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
        fail("Nested variant groups require a variant prefix", index);
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
        return fail(`Unmatched closing delimiter '${character}'`, index);
      }
      const next = text[index + 1];
      if (
        opener.group &&
        next !== undefined &&
        !isWhitespace(next) &&
        CLOSE_TO_OPEN[next] === undefined
      ) {
        fail("Variant groups must be separated by whitespace", index + 1);
      }
    }
  }

  const opener = stack.at(-1);
  if (opener) {
    fail(
      opener.group
        ? options.interpolationBoundary
          ? "Variant groups cannot cross a template interpolation"
          : "Unterminated variant group"
        : `Unterminated delimiter '${opener.character}'`,
      opener.index,
    );
  }
}

function findGroupOpener(text: string, start: number): number {
  const stack: string[] = [];
  let quote: string | undefined;
  let escaped = false;

  for (let index = start; index < text.length - 1; index += 1) {
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

function tryParseGroup(text: string, start: number): ParsedGroup | null {
  if (start > 0 && !isWhitespace(text[start - 1])) return null;

  const openParen = findGroupOpener(text, start);
  if (openParen < 0) return null;
  const prefix = text.slice(start, openParen);
  if (!prefix.endsWith(":")) return null;

  const end = findGroupEnd(text, openParen);
  if (end < 0) {
    return { end, prefix, body: text.slice(openParen + 1) };
  }
  return {
    end,
    prefix,
    body: text.slice(openParen + 1, end),
  };
}

function findGroupEnd(text: string, openParen: number): number {
  const stack: string[] = ["("];
  let quote: string | undefined;
  let escaped = false;

  for (let index = openParen + 1; index < text.length; index += 1) {
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

function splitTopLevelUtilities(body: string): string[] {
  const utilities: string[] = [];
  let tokenStart = 0;
  const stack: string[] = [];
  let quote: string | undefined;
  let escaped = false;

  const flush = (end: number) => {
    const utility = body.slice(tokenStart, end);
    if (utility.length > 0) utilities.push(utility);
  };

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index]!;

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
    if (CLOSE_TO_OPEN[character] !== undefined) {
      if (stack.at(-1) === CLOSE_TO_OPEN[character]) stack.pop();
      continue;
    }
    if (isWhitespace(character) && stack.length === 0) {
      flush(index);
      while (isWhitespace(body[index + 1])) index += 1;
      tokenStart = index + 1;
    }
  }
  flush(body.length);
  return utilities;
}

function expandSequence(body: string, inheritedPrefix: string): string[] {
  const expanded: string[] = [];
  for (const token of splitTopLevelUtilities(body)) {
    const nested = tryParseGroup(token, 0);
    if (nested !== null && nested.end === token.length - 1) {
      expanded.push(...expandSequence(nested.body, inheritedPrefix + nested.prefix));
    } else {
      expanded.push(inheritedPrefix + token);
    }
  }
  return expanded;
}

export function expandVariantGroupsInText(
  text: string,
  options: ExpandTextOptions = {},
): TextExpansion {
  const strict = options.strict ?? true;
  if (options.validateDelimiters && strict) validateDelimiters(text, options);
  const candidates: string[] = [];
  const output: string[] = [];
  let changed = false;
  let cursor = 0;

  while (cursor < text.length) {
    const canStart = cursor === 0 || isWhitespace(text[cursor - 1]);
    const parsed = canStart ? tryParseGroup(text, cursor) : null;
    if (parsed === null) {
      output.push(text[cursor]!);
      cursor += 1;
      continue;
    }
    if (parsed.end < 0) {
      if (strict) {
        const message = options.interpolationBoundary
          ? "Variant groups cannot cross a template interpolation"
          : "Unterminated variant group";
        throw new VariantGroupSyntaxError(message, cursor + parsed.prefix.length, {
          filename: options.filename,
          source: options.source ?? text,
          offset: options.offset,
        });
      }
      output.push(text.slice(cursor));
      break;
    }

    const groupCandidates = expandSequence(parsed.body, parsed.prefix);
    if (groupCandidates.length === 0) {
      output.push(text.slice(cursor, parsed.end + 1));
    } else {
      output.push(groupCandidates.join(" "));
      candidates.push(...groupCandidates);
      changed = true;
    }
    cursor = parsed.end + 1;
  }

  return {
    code: output.join(""),
    candidates: [...new Set(candidates)],
    changed,
  };
}

export { expandSequence, findGroupEnd, splitTopLevelUtilities, tryParseGroup };
