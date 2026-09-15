import { describe, expect, it } from "vitest";
import {
  DEFAULT_ATTRIBUTES,
  DEFAULT_CALLEES,
  extractStaticClassLists,
} from "../src/class-lists.js";

const defaults = {
  attributes: new Set<string>(DEFAULT_ATTRIBUTES),
  callees: new Set<string>(DEFAULT_CALLEES),
};

describe("extractStaticClassLists", () => {
  it("extracts a configured JSX attribute with document ranges and parsed nodes", () => {
    const source = `export const Page = () => (
  <div className="md:(bg-red-500 hover:text-white)" />
);`;

    expect(extractStaticClassLists(source, "page.tsx", defaults)).toEqual([
      {
        text: "md:(bg-red-500 hover:text-white)",
        range: { start: 46, end: 78 },
        nodes: [
          expect.objectContaining({
            kind: "group",
            candidates: ["md:bg-red-500", "md:hover:text-white"],
          }),
        ],
      },
    ]);
  });

  it("recursively extracts static configured-callee values but ignores unrelated strings", () => {
    const source = `
const unrelated = "md:(hidden block)";
const classes = cn(
  ["p-4", condition && "hover:(underline text-white)"],
  { active: condition ? "md:flex" : "md:grid" },
);
`;

    expect(
      extractStaticClassLists(source, "classes.ts", defaults).map(({ text }) => text),
    ).toEqual(["p-4", "hover:(underline text-white)", "md:flex", "md:grid"]);
  });

  it("supports replacement attributes and callees and skips dynamic templates", () => {
    const source = `
const a = custom(\`md:(flex gap-4)\`);
const b = custom(\`md:(flex ${"${value}"})\`);
const view = <div data-tw="hover:(underline text-white)" className="p-4" />;
`;

    expect(
      extractStaticClassLists(source, "custom.tsx", {
        attributes: new Set(["data-tw"]),
        callees: new Set(["custom"]),
      }).map(({ text }) => text),
    ).toEqual(["md:(flex gap-4)", "hover:(underline text-white)"]);
  });
});
