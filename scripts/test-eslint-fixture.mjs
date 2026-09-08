import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureRoot = fileURLToPath(
  new URL("../tests/fixtures/next-app", import.meta.url),
);
const fixtureRequire = createRequire(path.join(fixtureRoot, "package.json"));
const { ESLint } = fixtureRequire("eslint");
const { expandVariantGroupsInText } = fixtureRequire("tailwind-variant-groups");
const eslint = new ESLint({ cwd: fixtureRoot, fix: true });
const filePath = path.join(fixtureRoot, "app/lint-example.tsx");
const conflictRules = [
  "classnames-order",
  "enforces-canonical-classname",
  "enforces-negative-arbitrary-values",
  "enforces-shorthand",
  "important-modifier-suffix",
  "no-arbitrary-value",
  "no-custom-classname",
  "no-contradicting-classname",
  "no-unnecessary-arbitrary-value",
];
const config = await eslint.calculateConfigForFile(filePath);
for (const rule of conflictRules) {
  assert.equal(
    config?.rules?.[`tailwindcss/${rule}`]?.[0],
    0,
    `${rule} must be disabled after the Tailwind recommended preset`,
  );
}
const original = await fs.readFile(filePath, "utf8");
const [result] = await eslint.lintFiles([filePath]);
assert.equal(result.errorCount, 0, JSON.stringify(result.messages));
assert.ok(
  result.messages.every(({ ruleId }) => !ruleId?.startsWith("tailwindcss/")),
  JSON.stringify(result.messages),
);
assert.ok(result.output?.includes("md:(my-2 size-2)"), result.output);
assert.ok(result.output?.includes("md:(hover:(bg-red-500 text-white))"), result.output);
const nested = result.output.match(/md:\(hover:\([^)]+\)\)/)?.[0];
assert.ok(nested);
assert.equal(
  expandVariantGroupsInText(nested).code,
  "md:hover:bg-red-500 md:hover:text-white",
);
const [second] = await eslint.lintText(result.output, { filePath });
assert.equal(second.output, undefined);
assert.deepEqual(second.messages, []);
assert.equal(
  await fs.readFile(filePath, "utf8"),
  original,
  "lint fixes must remain in memory",
);
console.log(
  "Next ESLint compatibility: nine conflict rules disabled; helper fixes idempotent",
);
