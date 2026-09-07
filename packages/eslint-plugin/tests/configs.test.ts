import { describe, expect, it } from "vitest";
import plugin from "../src/index.js";

const conflictingRules = [
  "classnames-order",
  "enforces-canonical-classname",
  "enforces-negative-arbitrary-values",
  "enforces-shorthand",
  "important-modifier-suffix",
  "no-arbitrary-value",
  "no-custom-classname",
  "no-contradicting-classname",
  "no-unnecessary-arbitrary-value",
] as const;

describe("flat configs", () => {
  it("exports the two rules in a self-contained recommended config", () => {
    expect(plugin.meta.name).toBe("eslint-plugin-tailwind-variant-groups");
    expect(plugin.configs["flat/recommended"].plugins).toEqual({
      "tailwind-variant-groups": plugin,
    });
    expect(plugin.configs["flat/recommended"].rules).toMatchObject({
      "tailwind-variant-groups/format-variant-groups": "warn",
      "tailwind-variant-groups/no-invalid-variant-groups": "error",
    });
  });

  it("turns off every class-tokenizing tailwindcss rule", () => {
    const rules = plugin.configs["flat/compat-tailwindcss"].rules;
    for (const name of conflictingRules) {
      expect(rules["tailwindcss/" + name]).toBe("off");
    }
  });
});
