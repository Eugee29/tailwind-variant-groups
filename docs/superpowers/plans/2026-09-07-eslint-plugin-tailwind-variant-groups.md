# ESLint Plugin for Tailwind Variant Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or superpowers:executing-plans
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separately published ESLint plugin that safely canonicalizes, sorts, and
groups static Tailwind CSS 4.3+ class lists while coexisting with
`eslint-plugin-tailwindcss`.

**Architecture:** Keep the existing runtime package at the repository root, expose its
text parser through the public root export, and add `packages/eslint-plugin` as a second
pnpm workspace package. ESLint extracts complete static class-list ranges, expands
current groups, batches candidates through a cached synchronous Tailwind worker, then
applies one whole-range fix per class string using a pure deterministic serializer.

**Tech Stack:** TypeScript 5.9, pnpm 11.25, ESLint 9/10 flat config, Tailwind CSS and
`@tailwindcss/node` 4.3+, Synckit 0.11, tsup, Vitest, Next.js 16.

**Spec:**
`docs/superpowers/specs/2026-09-02-eslint-plugin-tailwind-variant-groups-design.md`

## Global Constraints

- Keep `tailwind-variant-groups` compatible with Tailwind CSS `>=4.1 <5`, Next.js
  `>=16 <17`, and Node.js `>=20.9`.
- Require Tailwind CSS `>=4.3 <5`, ESLint `>=9 <11`, and Node.js `>=20.19` only in
  `eslint-plugin-tailwind-variant-groups`.
- Support JavaScript, JSX, TypeScript, and TSX through ESLint flat config; do not add
  MDX or framework-template support.
- Format only complete static string literals and interpolation-free templates in
  configured attributes or helper calls.
- Never evaluate JavaScript, cross string boundaries, delete unknown candidates, or emit
  partial class-token fixes.
- Keep `prettier-plugin-tailwindcss` class sorting disabled in the supported
  configuration; plain Prettier remains supported.
- Use the project's Tailwind stylesheet as the source of theme, utility, variant,
  canonicalization, and ordering behavior.
- Use pnpm for repository and contributor commands; consumer documentation must also
  include npm, Yarn, and Bun.
- Follow TDD in every task and commit only the files named by that task after its
  focused verification passes.

## File map

### Existing runtime package

- Modify `src/index.ts` to expose `expandVariantGroupsInText`, `splitTopLevelUtilities`,
  and their public types.
- Create `tests/core/public-api.test.ts` to protect those exports.
- Modify `pnpm-workspace.yaml` and root `package.json` only when the new workspace
  package and aggregate verification are introduced.

### ESLint package

- Create `packages/eslint-plugin/package.json` for package exports, peer dependencies,
  and package-local scripts.
- Create `packages/eslint-plugin/tsconfig.json`, `vitest.config.ts`, and
  `tsup.config.ts` for isolated checking, tests, and dual ESM/CommonJS builds.
- Create `packages/eslint-plugin/src/protocol.ts` for structured-clone-safe worker and
  formatter types.
- Create `packages/eslint-plugin/src/formatter.ts` for stable ordering and recursive
  contiguous-prefix grouping.
- Create `packages/eslint-plugin/src/tailwind/analyze.ts` for asynchronous Tailwind
  design-system loading, caching, canonicalization, and candidate metadata.
- Create `packages/eslint-plugin/src/tailwind/worker.ts` and `client.ts` for the Synckit
  bridge.
- Create `packages/eslint-plugin/src/settings.ts` for shared settings and rule-option
  resolution.
- Create `packages/eslint-plugin/src/extract-class-lists.ts` for JSX/helper-call target
  discovery.
- Create `packages/eslint-plugin/src/rules/no-invalid-variant-groups.ts` and
  `format-variant-groups.ts` for diagnostics and atomic fixes.
- Create `packages/eslint-plugin/src/index.ts` for plugin metadata, rule exports, and
  flat configs.
- Create focused tests beside those responsibilities under
  `packages/eslint-plugin/tests`.
- Create `packages/eslint-plugin/scripts/test-worker.mjs` and `test-package.mjs` for
  built-artifact and consumer checks.
- Create `packages/eslint-plugin/README.md` and `LICENSE` for publication.

### Integration fixture and repository gates

- Modify `tests/fixtures/next-app/package.json` and `app/page.tsx`.
- Create `tests/fixtures/next-app/eslint.config.mjs` and `app/lint-example.tsx`.
- Create `scripts/test-eslint-fixture.mjs`.
- Modify root `package.json` and `pnpm-lock.yaml` to add the aggregate ESLint
  verification gate.
- Modify `README.md` to link and configure the optional companion package.

---

### Task 1: Publish the Existing Group Parser as a Shared API

**Files:**

- Modify: `src/index.ts:1`
- Create: `tests/core/public-api.test.ts`

**Interfaces:**

- Consumes: existing `expandVariantGroupsInText(text, options)` and
  `splitTopLevelUtilities(body)` from `src/core/expand-text.ts`.
- Produces: root-package exports `expandVariantGroupsInText`, `splitTopLevelUtilities`,
  `ExpandTextOptions`, and `TextExpansion` for the ESLint package.

- [ ] **Step 1: Write the failing public-export test**

Create `tests/core/public-api.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { expandVariantGroupsInText, splitTopLevelUtilities } from "../../src/index.js";

describe("class-list parser public API", () => {
  it("expands groups and tokenizes arbitrary values without splitting internals", () => {
    const expanded = expandVariantGroupsInText(
      "block md:(grid grid-cols-[1fr_2fr] hover:(text-white underline))",
    );

    expect(splitTopLevelUtilities(expanded.code)).toEqual([
      "block",
      "md:grid",
      "md:grid-cols-[1fr_2fr]",
      "md:hover:text-white",
      "md:hover:underline",
    ]);
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing exports**

Run:

```bash
pnpm exec vitest run tests/core/public-api.test.ts
```

Expected: FAIL because `src/index.ts` does not export the two text helpers.

- [ ] **Step 3: Add the narrow public exports**

Append this export block to `src/index.ts`:

```ts
export {
  expandVariantGroupsInText,
  splitTopLevelUtilities,
  type ExpandTextOptions,
  type TextExpansion,
} from "./core/expand-text.js";
```

Do not export `tryParseGroup`, `findGroupEnd`, or `expandSequence`; those remain
implementation details.

- [ ] **Step 4: Verify the runtime package**

Run:

```bash
pnpm exec vitest run tests/core/public-api.test.ts tests/core
pnpm typecheck
pnpm build
```

Expected: all commands PASS and `dist/index.d.ts` contains the four new exports.

- [ ] **Step 5: Commit the shared API**

```bash
git add src/index.ts tests/core/public-api.test.ts
git commit -m "feat: expose variant group parser API"
```

### Task 2: Scaffold the Workspace Package and Pure Formatter

**Files:**

- Modify: `pnpm-workspace.yaml`
- Create: `packages/eslint-plugin/package.json`
- Create: `packages/eslint-plugin/tsconfig.json`
- Create: `packages/eslint-plugin/vitest.config.ts`
- Create: `packages/eslint-plugin/tsup.config.ts`
- Create: `packages/eslint-plugin/src/protocol.ts`
- Create: `packages/eslint-plugin/src/formatter.ts`
- Create: `packages/eslint-plugin/tests/formatter.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: no Tailwind runtime yet; tests supply analyzed candidate metadata.
- Produces: `AnalyzedCandidate`, `FormatOptions`, `sortAnalyzedCandidates(items)`, and
  `serializeVariantGroups(items, options)`.

- [ ] **Step 1: Add the workspace and package scaffold**

Change `pnpm-workspace.yaml` to include the root, package directory, and existing
fixture:

```yaml
packages:
  - "."
  - "packages/*"
  - "tests/fixtures/next-app"

allowBuilds:
  esbuild: true
```

Create `packages/eslint-plugin/package.json` with this initial shape:

```json
{
  "name": "eslint-plugin-tailwind-variant-groups",
  "version": "0.1.0",
  "description": "ESLint formatting and validation for Tailwind CSS variant groups",
  "license": "MIT",
  "type": "module",
  "packageManager": "pnpm@11.25.0",
  "sideEffects": false,
  "engines": {
    "node": ">=20.19"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "scripts": {
    "build": "tsup --config tsup.config.ts",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tailwindcss/node": "^4.3.0",
    "synckit": "^0.11.13",
    "tailwind-variant-groups": "workspace:*"
  },
  "peerDependencies": {
    "eslint": ">=9 <11",
    "tailwindcss": ">=4.3 <5"
  },
  "devDependencies": {
    "@types/eslint": "^9.6.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "eslint-plugin-tailwindcss": "^4.4.0",
    "prettier": "^3.6.0",
    "tailwindcss": "^4.3.0",
    "tsup": "^8.5.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  }
}
```

Create `packages/eslint-plugin/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "include": ["src", "tests", "tsup.config.ts", "vitest.config.ts"]
}
```

Create `packages/eslint-plugin/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    clearMocks: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

Create the initial `packages/eslint-plugin/tsup.config.ts` with only the formatter
entry; later tasks add the worker and public plugin entries when those files exist:

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  bundle: true,
  clean: true,
  dts: false,
  entry: { formatter: "src/formatter.ts" },
  format: ["esm", "cjs"],
  outExtension({ format }) {
    return { js: format === "esm" ? ".js" : ".cjs" };
  },
  platform: "node",
  sourcemap: true,
  target: "node20",
  treeshake: true,
});
```

Run `pnpm install` once so `pnpm-lock.yaml` records the workspace and dependencies.

- [ ] **Step 2: Define the structured formatter protocol**

Create `packages/eslint-plugin/src/protocol.ts`:

```ts
export interface AnalyzedCandidate {
  raw: string;
  utility: string;
  variants: string[];
  order: string | null;
  parsed: boolean;
  sourceIndex: number;
}

export interface FormatOptions {
  canonicalize: boolean;
  collapse: boolean;
  sort: boolean;
  group: boolean;
  rootFontSize: number;
}

export interface AnalyzeRequest {
  stylesheet: string;
  lists: string[][];
  options: Pick<FormatOptions, "canonicalize" | "collapse" | "rootFontSize">;
}

export interface AnalyzeResponse {
  lists: AnalyzedCandidate[][];
}
```

Orders are decimal strings because BigInt values cannot be mixed with numeric JSON-style
sorting logic and the worker protocol must remain explicit.

- [ ] **Step 3: Write failing stable-sort and grouping tests**

Create `packages/eslint-plugin/tests/formatter.test.ts` with a helper and these cases:

```ts
import { describe, expect, it } from "vitest";
import { serializeVariantGroups, sortAnalyzedCandidates } from "../src/formatter.js";
import type { AnalyzedCandidate } from "../src/protocol.js";

function candidate(
  raw: string,
  variants: string[],
  utility: string,
  order: string | null,
  sourceIndex: number,
  parsed = true,
): AnalyzedCandidate {
  return { raw, variants, utility, order, sourceIndex, parsed };
}

describe("pure candidate formatter", () => {
  it("sorts unknowns stably before ordered Tailwind candidates", () => {
    const values = [
      candidate("md:gap-4", ["md"], "gap-4", "2", 0),
      candidate("custom-a", [], "custom-a", null, 1, false),
      candidate("md:flex", ["md"], "flex", "1", 2),
      candidate("custom-b", [], "custom-b", null, 3, false),
    ];

    expect(sortAnalyzedCandidates(values).map((item) => item.raw)).toEqual([
      "custom-a",
      "custom-b",
      "md:flex",
      "md:gap-4",
    ]);
  });

  it("groups repeated contiguous prefixes and avoids single-child groups", () => {
    const values = [
      candidate("p-4", [], "p-4", "0", 0),
      candidate("md:size-2", ["md"], "size-2", "1", 1),
      candidate("md:my-2", ["md"], "my-2", "2", 2),
      candidate("md:hover:bg-red-500", ["md", "hover"], "bg-red-500", "3", 3),
      candidate("md:hover:text-white", ["md", "hover"], "text-white", "4", 4),
    ];

    expect(serializeVariantGroups(values, { sort: false, group: true })).toBe(
      "p-4 md:(size-2 my-2 hover:(bg-red-500 text-white))",
    );
  });

  it("keeps a one-item nested prefix inline and treats opaque items as boundaries", () => {
    const values = [
      candidate("md:flex", ["md"], "flex", "1", 0),
      candidate("md:hover:bg-red-500", ["md", "hover"], "bg-red-500", "2", 1),
      candidate("md:custom", [], "md:custom", null, 2, false),
      candidate("lg:grid", ["lg"], "grid", "3", 3),
      candidate("lg:gap-4", ["lg"], "gap-4", "4", 4),
    ];

    expect(serializeVariantGroups(values, { sort: false, group: true })).toBe(
      "md:(flex hover:bg-red-500) md:custom lg:(grid gap-4)",
    );
  });
});
```

- [ ] **Step 4: Run the formatter test and confirm failure**

Run:

```bash
pnpm --filter eslint-plugin-tailwind-variant-groups test -- formatter.test.ts
```

Expected: FAIL because `src/formatter.ts` does not exist.

- [ ] **Step 5: Implement stable sorting and recursive grouping**

Create `packages/eslint-plugin/src/formatter.ts`. Implement `sortAnalyzedCandidates` by
decorating each item with its current index, sorting null orders before non-null orders,
comparing non-null orders with `BigInt`, and using the decorated index as the final
stable tie-breaker.

Implement the serializer around this recursion:

```ts
import type { AnalyzedCandidate } from "./protocol.js";

export interface SerializeOptions {
  sort: boolean;
  group: boolean;
}

function serializeAtDepth(
  items: readonly AnalyzedCandidate[],
  depth: number,
): string[] {
  const output: string[] = [];

  for (let index = 0; index < items.length;) {
    const item = items[index]!;
    const variant = item.parsed ? item.variants[depth] : undefined;

    if (variant === undefined) {
      output.push(depth === 0 ? item.raw : item.utility);
      index += 1;
      continue;
    }

    let end = index + 1;
    while (
      end < items.length &&
      items[end]!.parsed &&
      items[end]!.variants[depth] === variant
    ) {
      end += 1;
    }

    if (end - index >= 2) {
      const body = serializeAtDepth(items.slice(index, end), depth + 1);
      output.push(variant + ":(" + body.join(" ") + ")");
    } else {
      const suffix = item.variants
        .slice(depth)
        .map((part) => part + ":")
        .join("");
      output.push(suffix + item.utility);
    }
    index = end;
  }

  return output;
}

export function serializeVariantGroups(
  items: readonly AnalyzedCandidate[],
  options: SerializeOptions,
): string {
  const ordered = options.sort ? sortAnalyzedCandidates(items) : [...items];
  if (!options.group) return ordered.map((item) => item.raw).join(" ");
  return serializeAtDepth(ordered, 0).join(" ");
}
```

Add the complete `sortAnalyzedCandidates` implementation above this code. Do not merge
non-contiguous runs or inspect the contents of an opaque candidate.

- [ ] **Step 6: Run package checks**

Run:

```bash
pnpm --filter eslint-plugin-tailwind-variant-groups test
pnpm --filter eslint-plugin-tailwind-variant-groups typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the package scaffold and formatter**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml packages/eslint-plugin
git commit -m "feat(eslint): add deterministic variant formatter"
```

### Task 3: Analyze Candidates with the Tailwind 4.3 Design System

**Files:**

- Create: `packages/eslint-plugin/src/tailwind/analyze.ts`
- Create: `packages/eslint-plugin/src/tailwind/worker.ts`
- Create: `packages/eslint-plugin/src/tailwind/client.ts`
- Create: `packages/eslint-plugin/tests/fixtures/tailwind.css`
- Create: `packages/eslint-plugin/tests/tailwind/analyze.test.ts`
- Create: `packages/eslint-plugin/scripts/test-worker.mjs`
- Modify: `packages/eslint-plugin/package.json`
- Modify: `packages/eslint-plugin/tsup.config.ts`

**Interfaces:**

- Consumes: `AnalyzeRequest` and `AnalyzeResponse` from Task 2.
- Produces: asynchronous `analyzeCandidateLists(request)` for direct tests and
  synchronous `analyzeCandidateListsSync(request)` for ESLint rules.

- [ ] **Step 1: Create the Tailwind fixture and failing analyzer tests**

Create `packages/eslint-plugin/tests/fixtures/tailwind.css`:

```css
@import "tailwindcss";

@theme {
  --color-brand: #123456;
}
```

Create `packages/eslint-plugin/tests/tailwind/analyze.test.ts`:

```ts
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  analyzeCandidateLists,
  assertSupportedTailwindVersion,
} from "../../src/tailwind/analyze.js";

const stylesheet = fileURLToPath(new URL("../fixtures/tailwind.css", import.meta.url));

describe("Tailwind candidate analysis", () => {
  it("canonicalizes, collapses, orders, and decomposes parsed candidates", async () => {
    const result = await analyzeCandidateLists({
      stylesheet,
      lists: [
        [
          "md:w-[8px]",
          "md:h-[8px]",
          "md:mt-2",
          "md:mb-2",
          "md:hover:bg-brand",
          "md:hover:text-white",
        ],
      ],
      options: { canonicalize: true, collapse: true, rootFontSize: 16 },
    });

    expect(result.lists[0]?.map((item) => item.raw)).toEqual([
      "md:size-2",
      "md:my-2",
      "md:hover:bg-brand",
      "md:hover:text-white",
    ]);
    expect(result.lists[0]?.[2]).toMatchObject({
      variants: ["md", "hover"],
      utility: "bg-brand",
      parsed: true,
    });
    expect(result.lists[0]?.every((item) => item.order !== null)).toBe(true);
  });

  it("preserves unknown candidates as opaque values", async () => {
    const result = await analyzeCandidateLists({
      stylesheet,
      lists: [["custom-card", "md:custom-card", "md:flex"]],
      options: { canonicalize: true, collapse: true, rootFontSize: 16 },
    });

    expect(result.lists[0]?.slice(0, 2)).toEqual([
      expect.objectContaining({ raw: "custom-card", parsed: false, order: null }),
      expect.objectContaining({ raw: "md:custom-card", parsed: false, order: null }),
    ]);
  });

  it.each(["4.2.4", "5.0.0"])("rejects unsupported Tailwind version %s", (version) => {
    expect(() => assertSupportedTailwindVersion(version, stylesheet)).toThrow(
      /Tailwind CSS >=4\.3 <5 is required/,
    );
  });

  it("includes the resolved stylesheet in loading failures", async () => {
    const missing = path.join(path.dirname(stylesheet), "missing.css");
    await expect(analyzeCandidateLists(requestFor(missing, ["flex"]))).rejects.toThrow(
      missing,
    );
  });

  it("reloads the design system when stylesheet metadata changes", async () => {
    const directory = await fs.mkdtemp(
      path.join(path.dirname(stylesheet), "cache-test-"),
    );
    const changingStylesheet = path.join(directory, "styles.css");

    try {
      await fs.writeFile(changingStylesheet, '@import "tailwindcss";');
      const before = await analyzeCandidateLists(
        requestFor(changingStylesheet, ["cache-card"]),
      );
      expect(before.lists[0]?.[0]?.parsed).toBe(false);

      await fs.writeFile(
        changingStylesheet,
        '@import "tailwindcss"; @utility cache-card { display: block; }',
      );
      const after = await analyzeCandidateLists(
        requestFor(changingStylesheet, ["cache-card"]),
      );
      expect(after.lists[0]?.[0]?.parsed).toBe(true);
    } finally {
      await fs.rm(directory, { force: true, recursive: true });
    }
  });
});
```

Import `node:fs/promises` and `node:path` in this test and add:

```ts
function requestFor(stylesheet: string, candidates: string[]): AnalyzeRequest {
  return {
    stylesheet,
    lists: [candidates],
    options: { canonicalize: true, collapse: true, rootFontSize: 16 },
  };
}
```

Import `AnalyzeRequest` from `src/protocol.ts`. The different file sizes make cache
invalidation deterministic without a timed wait.

- [ ] **Step 2: Run the analyzer test and confirm failure**

Run:

```bash
pnpm --filter eslint-plugin-tailwind-variant-groups test -- analyze.test.ts
```

Expected: FAIL because `src/tailwind/analyze.ts` does not exist.

- [ ] **Step 3: Implement design-system resolution and cache**

In `analyze.ts`, define a small local `DesignSystem` facade containing only
`canonicalizeCandidates`, `getClassOrder`, `parseCandidate`, `printCandidate`, and
`printVariant`. Resolve `stylesheet` to an absolute path, read its `mtimeMs` and `size`,
and cache:

```ts
interface CacheEntry {
  signature: string;
  designSystem: DesignSystem;
}

const designSystems = new Map<string, CacheEntry>();
```

Use `createRequire(stylesheet)` to load the project's `@tailwindcss/node` first and fall
back to the package dependency. Read the CSS and call:

```ts
const designSystem = await tailwindNode.__unstable__loadDesignSystem(css, {
  base: path.dirname(stylesheet),
});
```

Export `assertSupportedTailwindVersion(version, stylesheet)` and call it before loading
the design system. Reject versions outside Tailwind 4.3–4.x and reject a design system
without `canonicalizeCandidates` with one error containing the resolved stylesheet and
`Tailwind CSS >=4.3 <5 is required`. Export `clearDesignSystemCacheForTests()` from this
internal module so cache state can be reset between tests without exposing either helper
from the package.

- [ ] **Step 4: Implement canonicalization and metadata conversion**

For each list independently:

```ts
const canonical = request.options.canonicalize
  ? designSystem.canonicalizeCandidates(candidates, {
      rem: request.options.rootFontSize,
      collapse: request.options.collapse,
      logicalToPhysical: request.options.collapse,
    })
  : candidates;

const ordered = designSystem.getClassOrder(canonical);
```

For each candidate at index `sourceIndex`, accept parsing only when
`parseCandidate(raw)` returns exactly one result. Reverse the parsed candidate's
`variants` array to obtain outermost-to-innermost order, map each through
`printVariant`, clone the candidate with `variants: []`, and call `printCandidate` to
obtain `utility`. Convert a non-null BigInt order to a decimal string. When parsing
returns zero or multiple results, return `parsed: false`, `utility: raw`,
`variants: []`, and preserve the order returned by Tailwind.

- [ ] **Step 5: Add the Synckit worker and synchronous client**

Create `worker.ts`:

```ts
import { runAsWorker } from "synckit";
import { analyzeCandidateLists } from "./analyze.js";
import type { AnalyzeRequest } from "../protocol.js";

runAsWorker((request: AnalyzeRequest) => analyzeCandidateLists(request));
```

Create `client.ts` using the existing runtime package's dual-module path pattern:

```ts
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSyncFn } from "synckit";
import type { AnalyzeRequest, AnalyzeResponse } from "../protocol.js";

const commonjs = typeof __filename === "string";
const moduleUrl = commonjs ? pathToFileURL(__filename).href : import.meta.url;
const workerPath = fileURLToPath(
  new URL(commonjs ? "./worker.cjs" : "./worker.js", moduleUrl),
);
const runWorker = createSyncFn(workerPath) as (
  request: AnalyzeRequest,
) => AnalyzeResponse;

export function analyzeCandidateListsSync(request: AnalyzeRequest): AnalyzeResponse {
  return runWorker(request);
}
```

Update tsup's entry map to exactly:

```ts
entry: {
  client: "src/tailwind/client.ts",
  worker: "src/tailwind/worker.ts",
},
dts: false,
```

This task must emit `dist/client.js`, `dist/client.cjs`, `dist/worker.js`, and
`dist/worker.cjs`. Task 6 adds the public index and its declarations.

- [ ] **Step 6: Test the built worker**

Create `scripts/test-worker.mjs`:

```js
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeCandidateListsSync } from "../dist/client.js";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const result = analyzeCandidateListsSync({
  stylesheet: path.join(packageRoot, "tests/fixtures/tailwind.css"),
  lists: [["md:w-[8px]", "md:h-[8px]", "md:mt-2", "md:mb-2"]],
  options: { canonicalize: true, collapse: true, rootFontSize: 16 },
});

assert.deepEqual(
  result.lists[0]?.map((item) => item.raw),
  ["md:size-2", "md:my-2"],
);
```

Add `"test:worker": "pnpm build && node scripts/test-worker.mjs"` to the package
scripts. Keep `client` and `worker` out of package `exports` even though their files are
included for internal execution.

Run:

```bash
pnpm --filter eslint-plugin-tailwind-variant-groups test
pnpm --filter eslint-plugin-tailwind-variant-groups typecheck
pnpm --filter eslint-plugin-tailwind-variant-groups test:worker
```

Expected: all commands PASS and the built client finds the worker matching its module
format.

- [ ] **Step 7: Commit the Tailwind adapter**

```bash
git add packages/eslint-plugin
git commit -m "feat(eslint): analyze classes with Tailwind"
```

### Task 4: Extract Only Eligible Static Class Lists

**Files:**

- Create: `packages/eslint-plugin/src/settings.ts`
- Create: `packages/eslint-plugin/src/extract-class-lists.ts`
- Create: `packages/eslint-plugin/tests/extract-class-lists.test.ts`

**Interfaces:**

- Consumes: ESLint `Rule.RuleContext`, ESTree-compatible nodes, and shared settings.
- Produces: `resolveSettings(context, ruleOptions)` and
  `createClassListListeners(context, options, onTarget)` yielding non-overlapping
  `ClassListTarget` values.

- [ ] **Step 1: Define settings types and defaults**

Create `settings.ts` with:

```ts
import path from "node:path";
import type { Rule } from "eslint";
import type { FormatOptions } from "./protocol.js";

export const DEFAULT_ATTRIBUTES = ["class", "className"] as const;
export const DEFAULT_CALLEES = ["cn", "clsx", "cva"] as const;

export interface SharedSettings {
  stylesheet?: string;
  attributes?: string[];
  callees?: string[];
  rootFontSize?: number;
}

export interface RuleOptions {
  stylesheet?: string;
  attributes?: string[];
  callees?: string[];
  rootFontSize?: number;
  canonicalize?: boolean;
  collapse?: boolean;
  sort?: boolean;
  group?: boolean;
}

export interface ResolvedSettings extends FormatOptions {
  stylesheet: string | undefined;
  attributes: ReadonlySet<string>;
  callees: ReadonlySet<string>;
}
```

Implement `resolveSettings` so rule options override
`context.settings["tailwind-variant-groups"]`, arrays fall back to the defaults,
booleans default to `true`, and `rootFontSize` defaults to `16`. Resolve a non-empty
stylesheet against `context.cwd` when available and `process.cwd()` otherwise. Return
`stylesheet: undefined` instead of guessing a CSS file.

- [ ] **Step 2: Write an ESLint probe test for target extraction**

Create a test-only probe rule that calls `createClassListListeners` and reports
`target.text`. Verify this TSX source:

```tsx
const unrelated = "md:flex md:gap-4";
const view = <div className="md:flex md:gap-4" data-tw={`lg:grid lg:gap-8`} />;
const value = cn(
  "hover:bg-red-500 hover:text-white",
  enabled && "focus:ring-2 focus:ring-blue-500",
  ["sm:block sm:p-4"],
  { active: "xl:flex xl:gap-6" },
);
const dynamic = cn(`md:flex ${runtime} md:gap-4`);
```

Configure `attributes: ["className", "data-tw"]` and `callees: ["cn"]`. Assert that the
probe reports the JSX strings, helper argument strings, logical-expression branch, array
value, and object value. Assert that it does not report `unrelated`, the object key
`active`, or the interpolated template as format-eligible.

Add a second assertion that validation mode exposes each dynamic template segment with
`formatEligible: false` and marks the segment before an interpolation with
`interpolationAfter: true`.

- [ ] **Step 3: Run the extractor test and confirm failure**

Run:

```bash
pnpm --filter eslint-plugin-tailwind-variant-groups test -- extract-class-lists.test.ts
```

Expected: FAIL because `extract-class-lists.ts` does not exist.

- [ ] **Step 4: Implement class-list target extraction**

Define:

```ts
import type { Rule } from "eslint";

export interface ClassListTarget {
  node: Rule.Node;
  range: [number, number];
  text: string;
  formatEligible: boolean;
  interpolationAfter: boolean;
}

export interface ExtractOptions {
  attributes: ReadonlySet<string>;
  callees: ReadonlySet<string>;
  includeDynamicTemplateSegments: boolean;
}

export function createClassListListeners(
  context: Rule.RuleContext,
  options: ExtractOptions,
  onTarget: (target: ClassListTarget) => void,
): Rule.RuleListener;
```

Use `context.sourceCode ?? context.getSourceCode()` and raw source ranges so backslash
escapes and quote style remain unchanged. For an ordinary string or interpolation-free
template, emit the range inside its delimiters and mark it format-eligible. For a
dynamic template, emit no formatting target; when `includeDynamicTemplateSegments` is
true, emit its quasis only for validation and set `interpolationAfter` on every non-tail
quasi.

Visit default/configured JSX attributes and configured identifier calls. Within a
configured call, recurse only through:

- string and template literals;
- array elements and spread arguments;
- object property values and object spread arguments, never property keys;
- conditional and logical expression branches;
- parenthesized, chain, TypeScript assertion, non-null, instantiation, and satisfies
  wrappers.

Let nested configured calls receive their own `CallExpression` visitor and de-duplicate
emitted nodes with a `WeakSet`. Do not descend into arbitrary function bodies, imports,
directives, tagged templates, or unconfigured calls.

- [ ] **Step 5: Verify JS, JSX, TS, and TSX extraction**

Add table cases using Espree for JS/JSX and `@typescript-eslint/parser` for TS/TSX.
Include single quotes, double quotes, backticks, escaped arbitrary content, a custom
attribute, an aliased custom callee, nested configured calls, and an unrelated ordinary
string.

Run:

```bash
pnpm --filter eslint-plugin-tailwind-variant-groups test -- extract-class-lists.test.ts
pnpm --filter eslint-plugin-tailwind-variant-groups typecheck
```

Expected: PASS with no target ranges overlapping.

- [ ] **Step 6: Commit source extraction**

```bash
git add packages/eslint-plugin/src/settings.ts packages/eslint-plugin/src/extract-class-lists.ts packages/eslint-plugin/tests/extract-class-lists.test.ts
git commit -m "feat(eslint): extract configured class lists"
```

### Task 5: Add Syntax Validation and Atomic Formatting Rules

**Files:**

- Create: `packages/eslint-plugin/src/rules/no-invalid-variant-groups.ts`
- Create: `packages/eslint-plugin/src/rules/format-variant-groups.ts`
- Create: `packages/eslint-plugin/tests/rules/no-invalid-variant-groups.test.ts`
- Create: `packages/eslint-plugin/tests/rules/format-variant-groups.test.ts`

**Interfaces:**

- Consumes: parser exports from Task 1, extraction/settings from Task 4,
  `analyzeCandidateListsSync` from Task 3, and `serializeVariantGroups` from Task 2.
- Produces: ESLint rule modules `noInvalidVariantGroupsRule` and
  `formatVariantGroupsRule` plus an internal dependency-injected
  `createFormatVariantGroupsRule(dependencies)` for deterministic unit tests.

- [ ] **Step 1: Write failing syntax-rule tests**

Use ESLint `RuleTester` with JSX enabled and add:

```ts
ruleTester.run("no-invalid-variant-groups", noInvalidVariantGroupsRule, {
  valid: [
    { code: '<div className="md:(flex gap-4)" />' },
    { code: 'const value = "md:(not inspected"' },
  ],
  invalid: [
    {
      code: '<div className="md:(flex" />',
      errors: [{ messageId: "invalidGroup" }],
    },
    {
      code: "const value = cn(`md:(bg-${color})`)",
      errors: [{ messageId: "invalidGroup" }],
    },
  ],
});
```

Add a location assertion showing that `md:(` points to the opening group parenthesis
rather than the whole JSX element.

- [ ] **Step 2: Run the syntax-rule test and confirm failure**

Run:

```bash
pnpm --filter eslint-plugin-tailwind-variant-groups test -- no-invalid-variant-groups.test.ts
```

Expected: FAIL because the rule does not exist.

- [ ] **Step 3: Implement `no-invalid-variant-groups`**

Create a `problem` rule with message:

```ts
messages: {
  invalidGroup: "Invalid Tailwind variant group: {{reason}}.",
}
```

Use extraction with `includeDynamicTemplateSegments: true`. For each target, call:

```ts
expandVariantGroupsInText(target.text, {
  filename: context.filename,
  source: sourceCode.text,
  offset: target.range[0],
  interpolationBoundary: target.interpolationAfter,
});
```

Catch only `VariantGroupSyntaxError`, convert its absolute `index` with
`sourceCode.getLocFromIndex`, and report a one-character range plus the error message
without its repeated filename prefix. Re-throw unexpected errors. The rule has no fixer
and does not load Tailwind.

- [ ] **Step 4: Write failing formatter-rule tests with an injected analyzer**

Create a deterministic fake `analyze` function that maps each flat list to metadata
representing Tailwind's canonical result. Cover:

```tsx
<div className="p-4 md:w-[8px] md:h-[8px] md:mt-2 md:mb-2 md:hover:bg-red-500 md:hover:text-white" />
```

Expected output:

```tsx
<div className="p-4 md:(size-2 my-2 hover:(bg-red-500 text-white))" />
```

Also cover:

- two eligible strings in one file and assert the analyzer is called once with two
  lists;
- `cn`, `clsx`, and `cva` nested static values;
- a custom attribute and custom helper from settings;
- a dynamic template left unchanged;
- an opaque class preserved exactly;
- `sort: false`, `group: false`, `canonicalize: false`, and `collapse: false` options
  passed through correctly;
- malformed syntax receiving no formatter diagnostic or fix because the syntax rule owns
  it;
- missing `stylesheet` producing one `missingStylesheet` diagnostic per file;
- a thrown worker error producing one `tailwindFailure` diagnostic and no edits.

- [ ] **Step 5: Run the formatter test and confirm failure**

Run:

```bash
pnpm --filter eslint-plugin-tailwind-variant-groups test -- format-variant-groups.test.ts
```

Expected: FAIL because the formatter rule does not exist.

- [ ] **Step 6: Implement the batch formatter rule**

Define the injectable boundary:

```ts
import type { Rule } from "eslint";
import type { AnalyzeRequest, AnalyzeResponse } from "../protocol.js";

export interface FormatRuleDependencies {
  analyze(request: AnalyzeRequest): AnalyzeResponse;
}

export function createFormatVariantGroupsRule(
  dependencies: FormatRuleDependencies,
): Rule.RuleModule;

export const formatVariantGroupsRule = createFormatVariantGroupsRule({
  analyze: analyzeCandidateListsSync,
});
```

The rule metadata must use `type: "layout"`, `fixable: "code"`, one object schema
containing the documented settings overrides, and messages `needsFormatting`,
`missingStylesheet`, and `tailwindFailure`.

Collect format-eligible targets during traversal. At `Program:exit`:

1. Resolve settings once and report only `missingStylesheet` when absent.
2. Expand each target with strict parsing and tokenize `expansion.code` with
   `splitTopLevelUtilities`.
3. Silently skip malformed targets so `no-invalid-variant-groups` is the sole syntax
   reporter.
4. Send all non-empty lists in one `AnalyzeRequest`.
5. Pair responses by list index, call `serializeVariantGroups` with resolved `sort` and
   `group`, and compare it with the target's raw inner text.
6. Report `needsFormatting` on each changed target and return exactly one
   `fixer.replaceTextRange(target.range, output)`.
7. If the worker throws or returns a different list count, report one file-level
   `tailwindFailure` on the Program and emit no fixes for that file.

Do not call the worker when every eligible list is empty or malformed.

- [ ] **Step 7: Verify both rules and second-pass stability**

Add a `Linter` test that runs `verifyAndFix` once, feeds its output into `verifyAndFix`
again, and asserts `second.fixed === false` with identical output. Add a multi-target
test confirming fixes do not overlap.

Run:

```bash
pnpm --filter eslint-plugin-tailwind-variant-groups test -- rules
pnpm --filter eslint-plugin-tailwind-variant-groups test
pnpm --filter eslint-plugin-tailwind-variant-groups typecheck
```

Expected: PASS with no duplicate malformed-group diagnostic and no second-pass change.

- [ ] **Step 8: Commit both rules**

```bash
git add packages/eslint-plugin/src/rules packages/eslint-plugin/tests/rules
git commit -m "feat(eslint): add variant group rules"
```

### Task 6: Export Flat Configs and Disable Conflicting Tailwind Rules

**Files:**

- Create: `packages/eslint-plugin/src/index.ts`
- Create: `packages/eslint-plugin/tests/configs.test.ts`
- Modify: `packages/eslint-plugin/tsup.config.ts`
- Modify: `packages/eslint-plugin/package.json`

**Interfaces:**

- Consumes: both rule modules from Task 5.
- Produces: the package default export with plugin metadata, `rules`,
  `flat/recommended`, and `flat/compat-tailwindcss`.

- [ ] **Step 1: Write failing plugin/config tests**

Create `packages/eslint-plugin/tests/configs.test.ts` and assert:

```ts
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
```

- [ ] **Step 2: Run the config test and confirm failure**

Run:

```bash
pnpm --filter eslint-plugin-tailwind-variant-groups test -- configs.test.ts
```

Expected: FAIL because `src/index.ts` does not exist.

- [ ] **Step 3: Build the plugin object without circular initialization bugs**

Create the plugin object first with an empty `configs` record, then assign both config
objects so each `plugins` map can self-reference the finalized plugin:

```ts
const plugin = {
  meta: {
    name: "eslint-plugin-tailwind-variant-groups",
    version: "0.1.0",
  },
  rules: {
    "format-variant-groups": formatVariantGroupsRule,
    "no-invalid-variant-groups": noInvalidVariantGroupsRule,
  },
  configs: {} as Record<string, FlatConfig>,
};

plugin.configs["flat/recommended"] = {
  name: "tailwind-variant-groups/recommended",
  plugins: { "tailwind-variant-groups": plugin },
  rules: {
    "tailwind-variant-groups/format-variant-groups": "warn",
    "tailwind-variant-groups/no-invalid-variant-groups": "error",
  },
};
```

Build `flat/compat-tailwindcss` from the recommended config and an explicit constant
containing all nine conflicting rule IDs from the test. Set every one to `"off"`. Export
the plugin as default and export both rule modules as named exports for advanced
testing.

- [ ] **Step 4: Finalize dual-module package output**

Update the tsup entry and declaration fields to:

```ts
entry: {
  index: "src/index.ts",
  client: "src/tailwind/client.ts",
  worker: "src/tailwind/worker.ts",
},
dts: {
  entry: { index: "src/index.ts" },
},
```

Keep the Task 2 dual-format, extension, Node target, sourcemap, and treeshaking options.
Bundle local source into `index.js`/`index.cjs`, emit `client.js`/`client.cjs` and
`worker.js`/`worker.cjs` beside it, and let tsup externalize declared package
dependencies. Verify that no public declaration is generated for the internal client or
worker.

Add package scripts:

```json
{
  "test:package": "pnpm build && node scripts/test-package.mjs",
  "test:worker": "pnpm build && node scripts/test-worker.mjs",
  "verify": "pnpm format:check && pnpm typecheck && pnpm test && pnpm test:worker && pnpm test:package"
}
```

- [ ] **Step 5: Verify package exports and rule metadata**

Run:

```bash
pnpm --filter eslint-plugin-tailwind-variant-groups test
pnpm --filter eslint-plugin-tailwind-variant-groups typecheck
pnpm --filter eslint-plugin-tailwind-variant-groups build
node --input-type=module -e "const p=(await import('./packages/eslint-plugin/dist/index.js')).default; if(!p.configs['flat/recommended']) process.exit(1)"
node -e "const p=require('./packages/eslint-plugin/dist/index.cjs'); const plugin=p.default||p; if(!plugin.rules['format-variant-groups']) process.exit(1)"
```

Expected: all commands PASS, both module formats expose the plugin, and both worker
formats are present.

- [ ] **Step 6: Commit plugin exports and presets**

```bash
git add packages/eslint-plugin
git commit -m "feat(eslint): add flat compatibility configs"
```

### Task 7: Verify Semantic Equivalence and the Packaged Plugin in Next.js

**Files:**

- Create: `packages/eslint-plugin/tests/semantic-equivalence.test.ts`
- Create: `packages/eslint-plugin/tests/prettier-compat.test.ts`
- Create: `packages/eslint-plugin/scripts/test-package.mjs`
- Create: `packages/eslint-plugin/scripts/test-eslint-versions.mjs`
- Modify: `packages/eslint-plugin/package.json`
- Modify: `tests/fixtures/next-app/package.json`
- Create: `tests/fixtures/next-app/eslint.config.mjs`
- Create: `tests/fixtures/next-app/app/lint-example.tsx`
- Modify: `tests/fixtures/next-app/app/page.tsx`
- Create: `scripts/test-eslint-fixture.mjs`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: the built ESLint package, its worker files, both flat configs, the existing
  Next.js runtime transformer, and the existing Tailwind/PostCSS fixture.
- Produces: package-consumer, ESLint 9/10, semantic-equivalence, compatibility-preset,
  and Next.js integration gates.

- [ ] **Step 1: Write the real Tailwind semantic-equivalence test**

Create `semantic-equivalence.test.ts`. Load the same stylesheet used by
`analyze.test.ts`, expand this source list, analyze and serialize it, then expand the
result:

```ts
const input = [
  "p-4",
  "md:w-[8px]",
  "md:h-[8px]",
  "md:mt-2",
  "md:mb-2",
  "md:hover:bg-brand",
  "md:hover:text-white",
];

const expectedCanonical = [
  "p-4",
  "md:size-2",
  "md:my-2",
  "md:hover:bg-brand",
  "md:hover:text-white",
];
```

Assert that expanding the serializer output returns `expectedCanonical` exactly. Then
load Tailwind's design system and call `candidatesToAst` for both `input` and
`expectedCanonical`. Recursively collect a sorted multiset of:

```ts
interface DeclarationSignature {
  atRules: string[];
  property: string;
  value: string | undefined;
  important: boolean;
}
```

Include enclosing at-rule names and parameters, ignore generated class selector
spelling, and compare the multisets. This confirms that canonical collapse preserves
declarations and responsive contexts while the expansion assertion separately preserves
the variant chains.

- [ ] **Step 2: Add plain Prettier coverage and run both focused tests**

Create `packages/eslint-plugin/tests/prettier-compat.test.ts`:

```ts
import prettier from "prettier";
import { describe, expect, it } from "vitest";

describe("plain Prettier compatibility", () => {
  it("preserves variant-group contents when no Tailwind Prettier plugin is loaded", async () => {
    const source =
      'const View = () => <div className="md:(flex gap-4 hover:(text-white))" />';
    const output = await prettier.format(source, { parser: "babel" });

    expect(output).toContain('className="md:(flex gap-4 hover:(text-white))"');
  });
});
```

Run:

```bash
pnpm --filter eslint-plugin-tailwind-variant-groups test -- semantic-equivalence.test.ts prettier-compat.test.ts
```

Expected: PASS. If the Tailwind internal AST shape differs, adapt only the generic
recursive declaration collector; do not weaken either semantic equality assertion or
load `prettier-plugin-tailwindcss` in the Prettier test.

- [ ] **Step 3: Create the package-consumer verification**

Create `packages/eslint-plugin/scripts/test-package.mjs` following the repository's
existing `scripts/test-package-types.mjs` pattern. It must:

1. Run `pnpm pack --dry-run --json` in the ESLint package.
2. Assert the listing includes `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`,
   `dist/worker.js`, and `dist/worker.cjs`. Task 8 adds and checks the publication
   documentation.
3. Assert the listing excludes `src`, `tests`, and fixture output.
4. Import `dist/index.js` and require `dist/index.cjs`, accepting
   `module.default ?? module` for the CommonJS bundle.
5. Assert both expose the two rules and two flat configs.
6. Create temporary `index.mts` and `index.cts` consumers, link the package into a
   temporary `node_modules` directory, and use the TypeScript compiler API to assert
   both module modes resolve without diagnostics.
7. Remove only the temporary consumer directory in `finally`.

Run:

```bash
pnpm --filter eslint-plugin-tailwind-variant-groups test:package
```

Expected: PASS with all public and worker artifacts present.

- [ ] **Step 4: Add an ESLint 9 and 10 runtime matrix**

Add this development alias to the ESLint package:

```json
{
  "eslint-10": "npm:eslint@^10.0.0"
}
```

Create `scripts/test-eslint-versions.mjs`. Import the built plugin and dynamically
import `eslint` and `eslint-10`. For each package, instantiate its `Linter` in
flat-config mode and run `verifyAndFix` over:

```jsx
const View = () => <div className="md:w-[8px] md:h-[8px] md:mt-2 md:mb-2" />;
```

Use the built `flat/recommended` config plus an absolute `tests/fixtures/tailwind.css`
setting. Assert zero errors and this output fragment:

```jsx
className = "md:(size-2 my-2)";
```

Run a second pass and assert it is unchanged. Add
`"test:eslint-versions": "pnpm build && node scripts/test-eslint-versions.mjs"` to
package scripts and include it in package `verify`.

- [ ] **Step 5: Configure the existing Next.js fixture for both ESLint plugins**

Replace `tests/fixtures/next-app/package.json` with:

```json
{
  "name": "tailwind-variant-groups-next-fixture",
  "private": true,
  "version": "0.0.0",
  "devDependencies": {
    "@tailwindcss/postcss": "^4.3.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "eslint-plugin-tailwindcss": "^4.4.0",
    "eslint-plugin-tailwind-variant-groups": "workspace:*",
    "next": "^16.0.0",
    "postcss": "^8.5.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-variant-groups": "workspace:*",
    "tailwindcss": "^4.3.0"
  }
}
```

Create `eslint.config.mjs`:

```js
import { fileURLToPath } from "node:url";
import parser from "@typescript-eslint/parser";
import tailwindcss from "eslint-plugin-tailwindcss";
import variantGroups from "eslint-plugin-tailwind-variant-groups";

export default [
  tailwindcss.configs.recommended,
  variantGroups.configs["flat/compat-tailwindcss"],
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      "tailwind-variant-groups": {
        stylesheet: fileURLToPath(new URL("./app/globals.css", import.meta.url)),
        callees: ["cn", "clsx", "cva"],
        attributes: ["class", "className"],
      },
    },
  },
];
```

The compatibility config must remain after `tailwindcss.configs.recommended`.

- [ ] **Step 6: Add a Next.js class-helper fixture**

Create `app/lint-example.tsx`:

```tsx
function cn(...values: Array<string | false>) {
  return values.filter(Boolean).join(" ");
}

export function LintExample() {
  return (
    <section
      className={cn(
        "md:w-[8px] md:h-[8px] md:mt-2 md:mb-2",
        true && "md:hover:bg-red-500 md:hover:text-white",
      )}
    >
      ESLint variant groups
    </section>
  );
}
```

Import and render `LintExample` from `app/page.tsx` without removing the existing
nested-group example. This makes the Next build exercise both an authored group and the
helper-call source shape.

- [ ] **Step 7: Add the compatibility fixture runner**

Create `scripts/test-eslint-fixture.mjs`. Resolve ESLint from the fixture with
`createRequire`, construct `new ESLint({ cwd: fixtureRoot, fix: true })`, and lint
`app/lint-example.tsx` without writing changes. Assert:

- `calculateConfigForFile` reports severity zero for all nine `tailwindcss/*` conflict
  rules;
- the first result has zero errors and no remaining message whose `ruleId` starts with
  `tailwindcss/`;
- `result.output` contains `md:(size-2 my-2)` and `md:hover:(bg-red-500 text-white)`;
- linting `result.output` again with the same file path produces no second-pass output.

Add root scripts:

```json
{
  "test:eslint": "pnpm --filter eslint-plugin-tailwind-variant-groups verify && node scripts/test-eslint-fixture.mjs",
  "verify": "pnpm format:check && pnpm typecheck && pnpm test && pnpm test:package && pnpm test:eslint && pnpm test:next"
}
```

Avoid a recursive `verify` call: package `verify` must not call the root script, and
root `test:eslint` must call only the package-local verify plus the fixture runner.

- [ ] **Step 8: Install and run all integration gates**

Run:

```bash
pnpm install
pnpm --filter eslint-plugin-tailwind-variant-groups test:eslint-versions
pnpm --filter eslint-plugin-tailwind-variant-groups test:package
pnpm test:eslint
pnpm test:next
```

Expected: ESLint 9 and 10 both format idempotently, the compatibility fixture emits no
original-plugin warning, the tarball contents are correct, and the existing Next fixture
builds under Turbopack and Webpack.

- [ ] **Step 9: Commit packaged integration coverage**

```bash
git add package.json pnpm-lock.yaml packages/eslint-plugin tests/fixtures/next-app scripts/test-eslint-fixture.mjs
git commit -m "test(eslint): verify packaged plugin in Next"
```

### Task 8: Document Installation, Ownership, and Compatibility

**Files:**

- Create: `packages/eslint-plugin/README.md`
- Create: `packages/eslint-plugin/LICENSE`
- Modify: `packages/eslint-plugin/scripts/test-package.mjs`
- Modify: `README.md`

**Interfaces:**

- Consumes: the final package name, configs, settings, rules, and compatibility behavior
  from Tasks 1–7.
- Produces: complete consumer setup for standalone use and coexistence with
  `eslint-plugin-tailwindcss`.

- [ ] **Step 1: Write all package-manager install commands**

Start `packages/eslint-plugin/README.md` with the package purpose, Tailwind 4.3+, ESLint
flat-config, and Node 20.19 requirements. Include:

```bash
pnpm add -D eslint-plugin-tailwind-variant-groups
npm install --save-dev eslint-plugin-tailwind-variant-groups
yarn add --dev eslint-plugin-tailwind-variant-groups
bun add --dev eslint-plugin-tailwind-variant-groups
```

State that `eslint` and `tailwindcss` are peer dependencies and that the application
must already have a Tailwind v4 stylesheet entry point.

- [ ] **Step 2: Document standalone and compatibility configs**

Include the standalone configuration:

```js
import variantGroups from "eslint-plugin-tailwind-variant-groups";

export default [
  variantGroups.configs["flat/recommended"],
  {
    settings: {
      "tailwind-variant-groups": {
        stylesheet: "./src/app/globals.css",
      },
    },
  },
];
```

Include the compatibility configuration with `tailwindcss.configs.recommended` first and
`variantGroups.configs["flat/compat-tailwindcss"]` second. Explain that the
compatibility preset disables the nine whitespace-tokenizing `tailwindcss/*` rules,
while unrelated ESLint rules continue to run. State explicitly that manually re-enabling
those fixers over grouped strings is unsupported because they can move utilities outside
their variant scope.

- [ ] **Step 3: Document behavior and options**

Show this exact transformation:

```tsx
// Before
<div className="p-4 md:w-[8px] md:h-[8px] md:mt-2 md:mb-2 md:hover:bg-red-500 md:hover:text-white" />

// After eslint --fix
<div className="p-4 md:(size-2 my-2 hover:(bg-red-500 text-white))" />
```

Document default attributes `class`/`className`, default callees `cn`/`clsx`/`cva`,
custom arrays, `rootFontSize`, and the `canonicalize`, `collapse`, `sort`, and `group`
rule options. Explain that dynamic template literals are ignored, unknown candidates are
preserved, malformed groups are reported, and the stylesheet path resolves from ESLint's
working directory.

Add a formatter-ownership section: plain Prettier is supported, but
`prettier-plugin-tailwindcss` class sorting must be disabled when this rule owns class
strings.

- [ ] **Step 4: Add package license and root README link**

Copy the repository MIT license text into `packages/eslint-plugin/LICENSE` with the same
copyright holder.

Add an optional “ESLint companion” section to the root `README.md`. Link
`eslint-plugin-tailwind-variant-groups`, show the short compatibility config, and direct
detailed options to the package README. Do not make the ESLint package a runtime
installation requirement.

Extend `scripts/test-package.mjs` so its dry-run listing now also requires `README.md`
and `LICENSE`. This converts publication documentation from a manual pack-list check
into a permanent package gate.

- [ ] **Step 5: Verify documentation and all release gates**

Run:

```bash
pnpm format
pnpm verify
pnpm pack --dry-run
pnpm --filter eslint-plugin-tailwind-variant-groups pack --dry-run
```

Expected: formatting, root runtime tests, package type checking, all ESLint tests,
worker and consumer checks, ESLint 9/10 checks, the compatibility fixture, and both
Next.js bundler builds PASS. Both dry-run listings contain only their intended
publication files.

- [ ] **Step 6: Commit documentation**

```bash
git add README.md packages/eslint-plugin/README.md packages/eslint-plugin/LICENSE packages/eslint-plugin/scripts/test-package.mjs
git commit -m "docs: document eslint variant groups"
```

### Task 9: Final Review and Release Readiness

**Files:**

- No source changes expected.
- Test: all root and package completion gates.

**Interfaces:**

- Consumes: the complete implementation from Tasks 1–8.
- Produces: evidence that the existing runtime package remains compatible and the ESLint
  package is safe to publish.

- [ ] **Step 1: Trace every acceptance criterion to a test**

Read `docs/superpowers/specs/2026-09-02-eslint-plugin-tailwind-variant-groups-design.md`
and inspect:

```bash
git diff 03f9047..HEAD --check
git diff 03f9047..HEAD --stat
git log --oneline 03f9047..HEAD
```

Confirm named automated coverage for parser reuse, JS/JSX/TS/TSX extraction, helper
calls, dynamic-template exclusion, canonicalization, collapse, stable sorting, nested
grouping, unknown preservation, invalid syntax, worker errors, cache invalidation,
compatibility-rule disabling, ESLint 9/10, semantic declaration equivalence, package
contents, and Next.js Turbopack/Webpack builds.

- [ ] **Step 2: Run the clean final verification**

Run:

```bash
pnpm verify
pnpm pack --dry-run
pnpm --filter eslint-plugin-tailwind-variant-groups pack --dry-run
git diff 03f9047..HEAD --check
git status --short
```

Expected: every command exits zero, both pack listings include their required
declarations and runtime artifacts, the diff check prints nothing, and the worktree is
clean. Do not weaken a failing fixture or skip a supported-version check; return the
failure to the task that owns it.

- [ ] **Step 3: Prepare the implementation handoff**

Report the exact passing commands, Tailwind/ESLint/Next versions exercised, package
names and versions, compatibility preset ordering, the requirement to disable
`prettier-plugin-tailwindcss` sorting, and any release action still requiring explicit
user authorization. Do not publish to npm or push a release tag unless the user
separately requests it.
