import type { HoverTarget } from "./hover-target.js";

function longestBacktickRun(value: string): number {
  let longest = 0;
  for (const match of value.matchAll(/`+/gu)) {
    longest = Math.max(longest, match[0].length);
  }
  return longest;
}

function inlineCode(value: string): string {
  const delimiter = "`".repeat(longestBacktickRun(value) + 1);
  return `${delimiter}${value}${delimiter}`;
}

function cssFence(css: string): string {
  const delimiter = "`".repeat(Math.max(3, longestBacktickRun(css) + 1));
  return `${delimiter}css\n${css}\n${delimiter}`;
}

export function renderHoverMarkdown(
  target: HoverTarget,
  cssByCandidate: readonly (string | null)[],
): string | undefined {
  const css = cssByCandidate
    .map((value) => value?.trim() ?? "")
    .filter((value) => value.length > 0);

  if (target.kind === "candidate") {
    const candidateCss = css[0];
    if (!candidateCss) return undefined;
    return [inlineCode(target.candidates[0]), "", cssFence(candidateCss)].join("\n");
  }

  if (target.candidates.length === 0) return undefined;

  const sections = [
    "**Expanded candidates**",
    "",
    ...target.candidates.map((candidate) => `- ${inlineCode(candidate)}`),
  ];
  if (css.length > 0) sections.push("", cssFence(css.join("\n\n")));
  return sections.join("\n");
}
