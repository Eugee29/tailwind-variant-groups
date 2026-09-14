import { describe, expect, it } from "vitest";
import { renderHoverMarkdown } from "../src/hover-markdown.js";
import type { HoverTarget } from "../src/hover-target.js";

describe("renderHoverMarkdown", () => {
  it("renders one effective candidate and its CSS", () => {
    const target: HoverTarget = {
      kind: "candidate",
      range: { start: 8, end: 18 },
      candidates: ["md:hover:text-white"],
    };

    expect(
      renderHoverMarkdown(target, [
        "@media (width >= 48rem) {\n  &:hover { color: white; }\n}",
      ]),
    ).toBe(
      [
        "`md:hover:text-white`",
        "",
        "```css",
        "@media (width >= 48rem) {",
        "  &:hover { color: white; }",
        "}",
        "```",
      ].join("\n"),
    );
  });

  it("returns no individual hover for an unsupported candidate", () => {
    const target: HoverTarget = {
      kind: "candidate",
      range: { start: 0, end: 7 },
      candidates: ["unknown"],
    };

    expect(renderHoverMarkdown(target, [null])).toBeUndefined();
  });

  it("lists every group candidate and combines only known CSS", () => {
    const target: HoverTarget = {
      kind: "group",
      range: { start: 0, end: 30 },
      candidates: ["md:flex", "md:unknown", "md:hover:block"],
    };

    expect(
      renderHoverMarkdown(target, [
        "@media (...) { .md\\:flex { display: flex; } }",
        null,
        "@media (...) { .md\\:hover\\:block { display: block; } }",
      ]),
    ).toBe(
      [
        "**Expanded candidates**",
        "",
        "- `md:flex`",
        "- `md:unknown`",
        "- `md:hover:block`",
        "",
        "```css",
        "@media (...) { .md\\:flex { display: flex; } }",
        "",
        "@media (...) { .md\\:hover\\:block { display: block; } }",
        "```",
      ].join("\n"),
    );
  });

  it("still lists a group when all candidates are unsupported", () => {
    const target: HoverTarget = {
      kind: "group",
      range: { start: 0, end: 12 },
      candidates: ["md:unknown"],
    };

    expect(renderHoverMarkdown(target, [null])).toBe(
      ["**Expanded candidates**", "", "- `md:unknown`"].join("\n"),
    );
  });

  it("uses an inline-code delimiter longer than candidate backtick runs", () => {
    const target: HoverTarget = {
      kind: "candidate",
      range: { start: 0, end: 20 },
      candidates: ["content-['``']"],
    };

    expect(renderHoverMarkdown(target, ["content: '``';"])).toContain(
      "```content-['``']```",
    );
  });
});
