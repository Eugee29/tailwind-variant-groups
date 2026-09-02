# Tailwind Variant Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or superpowers:executing-plans
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a package that expands UnoCSS-style variant groups in Next.js JavaScript
and TypeScript sources and makes the expanded candidates visible to Tailwind CSS 4 under
both Turbopack and Webpack.

**Architecture:** A pure, source-map-aware transformer locates static JavaScript and
TypeScript string ranges with `@babel/parser`, then expands balanced variant groups
within those ranges. A shared webpack-compatible loader rewrites Next.js modules, a Next
config wrapper installs that loader for Turbopack and Webpack, and a PostCSS companion
scans the same files and injects expanded candidates through `@source inline(...)`
before Tailwind runs.

**Tech Stack:** TypeScript, `@babel/parser`, `magic-string`, `fast-glob`, PostCSS 8,
Tailwind CSS 4, Next.js 16 for compatibility fixtures, Vitest, tsup, and Prettier.

**Spec:** `docs/superpowers/specs/2026-09-01-tailwind-variant-groups-design.md`

## Global Constraints

- Package name: `tailwind-variant-groups`.
- Package manager: pnpm 11.25.0 with `pnpm-lock.yaml`.
- Tailwind CSS compatibility: `>=4 <5`; Tailwind CSS 3 is unsupported.
- Next.js compatibility: `>=15.3 <17`.
- Node.js compatibility: `>=20.9`.
- PostCSS compatibility: 8.x.
- Transform only `.js`, `.jsx`, `.ts`, and `.tsx` sources; MDX is unsupported.
- Support variant groups only; utility-prefix grouping such as `font-(bold mono)` must
  remain unchanged.
- Support both Turbopack and Webpack without replacing Next.js's SWC compiler.
- Publish ESM and CommonJS entry points and TypeScript declarations.
- Strict mode defaults to `true`; malformed groups report filename, line, and column.
- No runtime or browser-side transformation.

---

## File Structure

- `package.json`: package metadata, peer ranges, exports, scripts, and published files.
- `tsconfig.json`: strict TypeScript configuration shared by source and tests.
- `tsup.config.ts`: dual ESM/CommonJS library builds and the CommonJS loader artifact.
- `vitest.config.ts`: unit and integration test discovery.
- `prettier.config.mjs`: repository formatting rules.
- `.gitignore`: dependency, build, fixture-output, and coverage exclusions.
- `src/core/error.ts`: `VariantGroupSyntaxError` and source-location calculation.
- `src/core/expand-text.ts`: balanced variant-group grammar and recursive prefix
  expansion for one static string range.
- `src/core/static-ranges.ts`: Babel parsing and discovery of transformable
  string/template ranges.
- `src/core/transform.ts`: source edits, candidate collection, fast path, and source-map
  production.
- `src/index.ts`: public core exports and types.
- `src/loader.ts`: webpack-compatible loader used by Turbopack and Webpack.
- `src/next.ts`: `withVariantGroups()` and non-destructive Next config merging.
- `src/postcss.ts`: source discovery/cache and `@source inline(...)` candidate
  injection.
- `tests/core/expand-text.test.ts`: grammar, nesting, arbitrary syntax, strictness, and
  location tests.
- `tests/core/transform.test.ts`: JS/TS/JSX/TSX range selection, interpolation, and
  source-map tests.
- `tests/loader.test.ts`: loader fast path, options, maps, and errors.
- `tests/next.test.ts`: Turbopack and Webpack configuration merging.
- `tests/postcss.test.ts`: real Tailwind 4 PostCSS generation and scanner cache
  behavior.
- `tests/fixtures/next-app/*`: minimal Next application using grouped classes.
- `scripts/test-next-fixture.mjs`: Turbopack and Webpack fixture build runner and
  artifact assertions.
- `README.md`: installation, configuration, syntax, options, compatibility, and
  limitations.
- `LICENSE`: MIT license attributed to project contributors.

### Task 1: Package Foundation and Balanced Group Grammar

**Files:**

- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `prettier.config.mjs`
- Create: `.gitignore`
- Create: `src/core/error.ts`
- Create: `src/core/expand-text.ts`
- Test: `tests/core/expand-text.test.ts`

**Interfaces:**

- Consumes: no earlier implementation tasks.
- Produces: `VariantGroupSyntaxError`, `ExpandTextOptions`, `TextExpansion`, and
  `expandVariantGroupsInText(text, options)` for Task 2.

- [ ] **Step 1: Add package and tool configuration**

Create `package.json` with the following stable public shape; use `pnpm install`
afterward so pnpm records the resolved compatible dependency versions in both files:

```json
{
  "name": "tailwind-variant-groups",
  "version": "0.1.0",
  "description": "UnoCSS-style variant groups for Tailwind CSS 4 and Next.js",
  "type": "module",
  "packageManager": "pnpm@11.25.0",
  "sideEffects": false,
  "engines": {
    "node": ">=20.9"
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
    },
    "./next": {
      "types": "./dist/next.d.ts",
      "import": "./dist/next.js",
      "require": "./dist/next.cjs"
    },
    "./postcss": {
      "types": "./dist/postcss.d.ts",
      "import": "./dist/postcss.js",
      "require": "./dist/postcss.cjs"
    },
    "./loader": {
      "types": "./dist/loader.d.ts",
      "require": "./dist/loader.cjs",
      "default": "./dist/loader.cjs"
    }
  },
  "scripts": {
    "build": "tsup",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:next": "pnpm build && node scripts/test-next-fixture.mjs",
    "typecheck": "tsc --noEmit",
    "verify": "pnpm format:check && pnpm typecheck && pnpm test && pnpm build && pnpm test:next"
  },
  "dependencies": {
    "@babel/parser": "^7.28.0",
    "fast-glob": "^3.3.3",
    "magic-string": "^0.30.18"
  },
  "peerDependencies": {
    "@tailwindcss/postcss": ">=4 <5",
    "next": ">=15.3 <17",
    "postcss": "^8.4.0",
    "tailwindcss": ">=4 <5"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.3.0",
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "next": "^16.0.0",
    "postcss": "^8.5.0",
    "prettier": "^3.6.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwindcss": "^4.3.0",
    "tsup": "^8.5.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  }
}
```

Run:

```bash
pnpm install
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "tests", "tsup.config.ts", "vitest.config.ts"]
}
```

Create `tsup.config.ts`:

```ts
import { existsSync } from "node:fs";
import { defineConfig } from "tsup";

const shared = {
  bundle: true,
  platform: "node" as const,
  target: "node20" as const,
  sourcemap: true,
  treeshake: true,
};

const libraryEntries = Object.fromEntries(
  Object.entries({
    index: "src/index.ts",
    next: "src/next.ts",
    postcss: "src/postcss.ts",
  }).filter(([, file]) => existsSync(file)),
);

export default defineConfig([
  {
    ...shared,
    clean: true,
    dts: true,
    entry: libraryEntries,
    format: ["esm", "cjs"],
    outExtension({ format }) {
      return { js: format === "esm" ? ".js" : ".cjs" };
    },
  },
  {
    ...shared,
    clean: false,
    dts: true,
    entry: { loader: "src/loader.ts" },
    format: ["cjs"],
    outExtension() {
      return { js: ".cjs" };
    },
  },
]);
```

Create `vitest.config.ts`:

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

Create `prettier.config.mjs`:

```js
export default {
  printWidth: 88,
  proseWrap: "always",
  trailingComma: "all",
};
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.next/
out/
tests/fixtures/**/.next/
tests/fixtures/**/out/
```

- [ ] **Step 2: Write failing grammar and error tests**

Create `tests/core/expand-text.test.ts` with table-driven coverage:

```ts
import { describe, expect, it } from "vitest";
import { expandVariantGroupsInText } from "../../src/core/expand-text.js";

describe("expandVariantGroupsInText", () => {
  it.each([
    ["md:(flex gap-4)", "md:flex md:gap-4"],
    ["md:hover:(bg-blue-500 text-white)", "md:hover:bg-blue-500 md:hover:text-white"],
    [
      "md:(flex hover:(underline text-blue-500))",
      "md:flex md:hover:underline md:hover:text-blue-500",
    ],
    [
      "[&>svg]:(size-5 fill-current) md:(grid grid-cols-[1fr_2fr])",
      "[&>svg]:size-5 [&>svg]:fill-current md:grid md:grid-cols-[1fr_2fr]",
    ],
    ["font-(bold mono)", "font-(bold mono)"],
  ])("expands %s", (input, expected) => {
    expect(expandVariantGroupsInText(input).code).toBe(expected);
  });

  it("collects only expanded leaf candidates", () => {
    expect(expandVariantGroupsInText("p-4 md:(flex gap-4)").candidates).toEqual([
      "md:flex",
      "md:gap-4",
    ]);
  });

  it("reports malformed syntax at its source location", () => {
    expect(() =>
      expandVariantGroupsInText("before\nmd:(flex", {
        filename: "/app/page.tsx",
      }),
    ).toThrowError(
      expect.objectContaining({
        name: "VariantGroupSyntaxError",
        filename: "/app/page.tsx",
        line: 2,
        column: 4,
      }),
    );
  });

  it("leaves malformed syntax unchanged when strict is false", () => {
    expect(expandVariantGroupsInText("md:(flex", { strict: false }).code).toBe(
      "md:(flex",
    );
  });
});
```

- [ ] **Step 3: Run the focused test and confirm the expected failure**

Run:

```bash
pnpm exec vitest run tests/core/expand-text.test.ts
```

Expected: FAIL because `src/core/expand-text.ts` does not exist.

- [ ] **Step 4: Implement the balanced grammar and source error**

Define these exact contracts:

```ts
export interface ExpandTextOptions {
  strict?: boolean;
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

export function expandVariantGroupsInText(
  text: string,
  options: ExpandTextOptions = {},
): TextExpansion;
```

Implement `VariantGroupSyntaxError` in `src/core/error.ts` with `filename`, zero-based
`index`, one-based `line`, and one-based `column`. Calculate location from
`options.source ?? text` and `options.offset ?? 0` so later AST-range errors point into
the original module.

In `expand-text.ts`, implement these focused helpers:

```ts
interface ParsedGroup {
  end: number;
  prefix: string;
  body: string;
}

function tryParseGroup(text: string, start: number): ParsedGroup | null;
function findGroupEnd(text: string, openParen: number): number;
function splitTopLevelUtilities(body: string): string[];
function expandSequence(body: string, inheritedPrefix: string): string[];
```

`tryParseGroup` must start only at the beginning of the range or after whitespace, scan
through bracketed/quoted arbitrary syntax, and recognize an unbracketed `:(` opener.
`findGroupEnd` must balance parentheses, square brackets, curly braces, quotes, and
backslash escapes. `splitTopLevelUtilities` must split only on whitespace at balance
depth zero. `expandSequence` recursively expands a token that is entirely a nested
group; otherwise it prepends the accumulated prefix to the leaf token. If a recognized
opener is unterminated, throw in strict mode and copy the original remainder in
non-strict mode. If the range ends at a template interpolation, use the message
`Variant groups cannot cross a template interpolation`.

- [ ] **Step 5: Run grammar tests and type checking**

Run:

```bash
pnpm exec vitest run tests/core/expand-text.test.ts
pnpm typecheck
```

Expected: both commands PASS.

- [ ] **Step 6: Commit the grammar slice**

```bash
git add package.json pnpm-lock.yaml tsconfig.json tsup.config.ts vitest.config.ts prettier.config.mjs .gitignore src/core tests/core/expand-text.test.ts
git commit -m "feat: parse nested Tailwind variant groups"
```

### Task 2: Static JS/TS Source Transformation

**Files:**

- Create: `src/core/static-ranges.ts`
- Create: `src/core/transform.ts`
- Create: `src/index.ts`
- Test: `tests/core/transform.test.ts`

**Interfaces:**

- Consumes: `expandVariantGroupsInText(text, options)` and `VariantGroupSyntaxError`
  from Task 1.
- Produces: `TransformOptions`, `TransformResult`, and
  `transformVariantGroups(source, options)` for the loader and PostCSS tasks.

- [ ] **Step 1: Write failing source-transformation tests**

Create `tests/core/transform.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { transformVariantGroups, VariantGroupSyntaxError } from "../../src/index.js";

describe("transformVariantGroups", () => {
  it("transforms static strings in TSX and leaves executable syntax alone", () => {
    const source = `
      import value from "md:(do not transform)";
      const matcher = /md:\\(flex gap-4\\)/;
      // md:(comment content)
      export const Page = () => (
        <div className="p-4 md:(flex gap-4 hover:(text-white))" />
      );
    `;

    const result = transformVariantGroups(source, { filename: "page.tsx" });

    expect(result.code).toContain(
      'className="p-4 md:flex md:gap-4 md:hover:text-white"',
    );
    expect(result.code).toContain('from "md:(do not transform)"');
    expect(result.code).toContain("// md:(comment content)");
    expect(result.candidates).toEqual(["md:flex", "md:gap-4", "md:hover:text-white"]);
    expect(result.map).not.toBeNull();
  });

  it("supports groups wholly contained in template segments", () => {
    const source = "const c = `base ${active ? 'on' : 'off'} md:(flex gap-4)`";
    expect(transformVariantGroups(source, { filename: "classes.ts" }).code).toContain(
      "md:flex md:gap-4",
    );
  });

  it("rejects a group that crosses template interpolation", () => {
    const source = "const c = `md:(bg-${color})`";
    expect(() =>
      transformVariantGroups(source, { filename: "/app/page.tsx" }),
    ).toThrowError(VariantGroupSyntaxError);
  });

  it("uses the marker fast path before parsing", () => {
    const invalidJavaScript = "const = ordinary-class";
    expect(transformVariantGroups(invalidJavaScript).code).toBe(invalidJavaScript);
  });

  it("is idempotent", () => {
    const once = transformVariantGroups('const c = "md:(flex gap-4)"');
    const twice = transformVariantGroups(once.code);
    expect(twice.code).toBe(once.code);
    expect(twice.changed).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
pnpm exec vitest run tests/core/transform.test.ts
```

Expected: FAIL because the public transformer is not implemented.

- [ ] **Step 3: Implement static range discovery**

In `src/core/static-ranges.ts`, define:

```ts
export interface StaticRange {
  start: number;
  end: number;
  interpolationAfter: boolean;
}

export function findStaticRanges(source: string, filename: string): StaticRange[];
```

Parse with `sourceType: "unambiguous"`. Enable `jsx` for `.js`/`.jsx`/`.tsx` and
`typescript` for `.ts`/`.tsx`; include `decorators-legacy` and `importAttributes`. Walk
the AST recursively without `@babel/traverse`, passing parent and property key. Collect
the raw content range inside `StringLiteral` quotes and the raw range for each
`TemplateElement`. Skip module-source strings owned by import declarations, export
declarations, `ImportExpression`, or a dynamic-import `CallExpression` whose callee type
is `Import`. Do not collect comments, regex literals, directives, or other executable
syntax. Set `interpolationAfter` to `true` for a template element whose `tail` flag is
false.

- [ ] **Step 4: Implement the public source transformer**

Define the public API in `src/core/transform.ts`:

```ts
import type { SourceMap } from "magic-string";

export interface TransformOptions {
  filename?: string;
  strict?: boolean;
  sourceMap?: boolean;
}

export interface TransformResult {
  code: string;
  candidates: string[];
  changed: boolean;
  map: SourceMap | null;
}

export function transformVariantGroups(
  source: string,
  options: TransformOptions = {},
): TransformResult;
```

Return immediately with the original code, no candidates, `changed: false`, and
`map: null` when `source.includes(":(")` is false. Otherwise, call `findStaticRanges`,
expand each range with its original-source offset and interpolation boundary, and apply
changed ranges through `MagicString.overwrite`. Deduplicate candidates while preserving
first-seen order. Generate a high-resolution source map with the filename when
`sourceMap !== false`; otherwise return `null`.

Export the transformer, types, and `VariantGroupSyntaxError` from `src/index.ts`.

- [ ] **Step 5: Run core tests and type checking**

Run:

```bash
pnpm exec vitest run tests/core
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the source transformer**

```bash
git add src/core src/index.ts tests/core/transform.test.ts
git commit -m "feat: transform static JavaScript class strings"
```

### Task 3: Shared Next.js Source Loader

**Files:**

- Create: `src/loader.ts`
- Test: `tests/loader.test.ts`

**Interfaces:**

- Consumes: `transformVariantGroups(source, { filename, strict, sourceMap })` from
  Task 2.
- Produces: a default CommonJS-compatible webpack loader accepting
  `{ strict?: boolean }` for Task 4.

- [ ] **Step 1: Write failing loader tests**

Create a minimal fake loader context and cover changed, unchanged, and malformed inputs:

```ts
import { describe, expect, it, vi } from "vitest";
import loader from "../src/loader.js";

function runLoader(source: string, strict = true, inputMap: unknown = null) {
  const callback = vi.fn();
  const cacheable = vi.fn();
  loader.call(
    {
      resourcePath: "/app/page.tsx",
      getOptions: () => ({ strict }),
      callback,
      cacheable,
    },
    source,
    inputMap,
  );
  return { callback, cacheable };
}

describe("variant group loader", () => {
  it("returns transformed code and a source map", () => {
    const { callback, cacheable } = runLoader(
      'export default <div className="md:(flex gap-4)" />',
    );
    expect(cacheable).toHaveBeenCalledWith(true);
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.stringContaining("md:flex md:gap-4"),
      expect.any(Object),
    );
  });

  it("preserves the incoming map on the unchanged fast path", () => {
    const inputMap = { version: 3 };
    const { callback } = runLoader('const c = "flex"', true, inputMap);
    expect(callback).toHaveBeenCalledWith(null, 'const c = "flex"', inputMap);
  });

  it("passes syntax errors to the bundler callback", () => {
    const { callback } = runLoader('const c = "md:(flex"');
    expect(callback.mock.calls[0]?.[0]).toMatchObject({
      name: "VariantGroupSyntaxError",
      filename: "/app/page.tsx",
    });
  });
});
```

- [ ] **Step 2: Run the loader test and confirm failure**

Run:

```bash
pnpm exec vitest run tests/loader.test.ts
```

Expected: FAIL because `src/loader.ts` does not exist.

- [ ] **Step 3: Implement the loader**

Use a local structural context type so webpack is not a runtime dependency:

```ts
export interface LoaderOptions {
  strict?: boolean;
}

interface LoaderContext {
  resourcePath: string;
  getOptions?: () => LoaderOptions;
  query?: LoaderOptions;
  cacheable?: (flag?: boolean) => void;
  callback: (error: Error | null, code?: string, map?: unknown) => void;
}

export default function variantGroupLoader(
  this: LoaderContext,
  source: string,
  inputMap?: unknown,
): void;
```

Call `cacheable(true)`, read options from `getOptions()` with `query` as a compatibility
fallback, and invoke `transformVariantGroups` with `resourcePath`. On the unchanged
path, return the original source and incoming map. On change, return transformed code
and the generated map. Catch unknown errors, normalize non-`Error` values to
`Error(String(value))`, and pass the error as the callback's first argument.

- [ ] **Step 4: Run loader and core tests**

Run:

```bash
pnpm exec vitest run tests/loader.test.ts tests/core
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Build and inspect the loader artifact**

Run:

```bash
pnpm build
node -e "const loader=require('./dist/loader.cjs'); if(typeof loader.default!=='function'&&typeof loader!=='function') process.exit(1)"
```

Expected: build succeeds and `dist/loader.cjs` exposes a callable loader.

- [ ] **Step 6: Commit the loader**

```bash
git add src/loader.ts tests/loader.test.ts tsup.config.ts
git commit -m "feat: add shared Next source loader"
```

### Task 4: Next.js Turbopack and Webpack Configuration Wrapper

**Files:**

- Create: `src/next.ts`
- Test: `tests/next.test.ts`

**Interfaces:**

- Consumes: the built loader filename `loader.cjs` and `LoaderOptions` from Task 3.
- Produces: `withVariantGroups(nextConfig?, options?)` exported from
  `tailwind-variant-groups/next`.

- [ ] **Step 1: Write failing config-merging tests**

Create `tests/next.test.ts` with a Turbopack rule preservation case and a Webpack
callback return-value case:

```ts
import { describe, expect, it, vi } from "vitest";
import { withVariantGroups } from "../src/next.js";

describe("withVariantGroups", () => {
  it("prepends a non-foreign JS/TS Turbopack rule and preserves star rules", () => {
    const existing = { loaders: ["existing-loader"] };
    const config = withVariantGroups({
      turbopack: { rules: { "*": existing, "*.svg": { loaders: ["svg"] } } },
    });

    expect(config.turbopack?.rules?.["*.svg"]).toEqual({ loaders: ["svg"] });
    expect(config.turbopack?.rules?.["*"]).toEqual([
      expect.objectContaining({
        condition: expect.any(Object),
        loaders: [
          expect.objectContaining({
            loader: expect.stringMatching(/loader\.cjs$/),
            options: { strict: true },
          }),
        ],
      }),
      existing,
    ]);
  });

  it("adds a Webpack pre-loader to the config returned by the user callback", () => {
    const returned = { module: { rules: [] as unknown[] } };
    const userWebpack = vi.fn(() => returned);
    const wrapped = withVariantGroups({ webpack: userWebpack });
    const original = { module: { rules: [] as unknown[] } };

    const result = wrapped.webpack?.(original as never, {} as never);

    expect(userWebpack).toHaveBeenCalledWith(original, expect.anything());
    expect(result).toBe(returned);
    expect(returned.module.rules[0]).toMatchObject({
      enforce: "pre",
      test: expect.any(RegExp),
      exclude: expect.any(RegExp),
    });
  });
});
```

- [ ] **Step 2: Run the Next wrapper test and confirm failure**

Run:

```bash
pnpm exec vitest run tests/next.test.ts
```

Expected: FAIL because `src/next.ts` does not exist.

- [ ] **Step 3: Implement loader-path resolution and Turbopack merging**

Define:

```ts
import type { NextConfig } from "next";

export interface NextVariantGroupOptions {
  strict?: boolean;
}

export function withVariantGroups(
  nextConfig?: NextConfig,
  options?: NextVariantGroupOptions,
): NextConfig;
```

Resolve `loader.cjs` next to the built `next` entry. Use
`typeof __filename === "string"` plus `pathToFileURL(__filename)` for CJS and
`import.meta.url` for ESM, then `fileURLToPath(new URL("./loader.cjs", moduleUrl))`.
This keeps the path valid in both package exports.

Create one Turbopack `"*"` rule with an `all` condition containing `{ not: "foreign" }`
and an `any` condition for `*.js`, `*.jsx`, `*.ts`, and `*.tsx`. Pass only the primitive
loader option `{ strict: options?.strict ?? true }`. If an existing `"*"` rule exists,
normalize it to an array and place the new rule first. Spread every other existing
`turbopack` option and rule unchanged.

- [ ] **Step 4: Implement Webpack callback preservation**

Capture `nextConfig.webpack`. The wrapped callback must first call the user's function
when present, use its return value when defined, then unshift this rule into
`result.module.rules`:

```ts
{
  enforce: "pre",
  test: /\.[jt]sx?$/,
  exclude: /node_modules/,
  use: [{ loader: loaderPath, options: { strict } }],
}
```

Always return the resulting config. Do not mutate the original `nextConfig` object or
remove unrelated properties.

- [ ] **Step 5: Run wrapper tests, build, and exercise both module formats**

Run:

```bash
pnpm exec vitest run tests/next.test.ts
pnpm typecheck
pnpm build
node -e "const {withVariantGroups}=require('./dist/next.cjs'); const c=withVariantGroups({}); if(!c.turbopack||typeof c.webpack!=='function') process.exit(1)"
node --input-type=module -e "import {withVariantGroups} from './dist/next.js'; const c=withVariantGroups({}); if(!c.turbopack||typeof c.webpack!=='function') process.exit(1)"
```

Expected: all commands PASS and both module formats resolve a `loader.cjs` path.

- [ ] **Step 6: Commit the Next wrapper**

```bash
git add src/next.ts tests/next.test.ts
git commit -m "feat: configure Turbopack and Webpack transforms"
```

### Task 5: Tailwind CSS 4 PostCSS Candidate Bridge

**Files:**

- Create: `src/postcss.ts`
- Test: `tests/postcss.test.ts`

**Interfaces:**

- Consumes: `transformVariantGroups(source, { filename, strict, sourceMap: false })`
  from Task 2.
- Produces: a PostCSS 8 plugin creator exported from `tailwind-variant-groups/postcss`.

- [ ] **Step 1: Write failing PostCSS integration tests**

Use a temporary directory, real `@tailwindcss/postcss`, and a source component:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import tailwindcss from "@tailwindcss/postcss";
import postcss from "postcss";
import { afterEach, describe, expect, it } from "vitest";
import variantGroups from "../src/postcss.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("PostCSS candidate bridge", () => {
  it("generates Tailwind CSS for expanded responsive and nested candidates", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "variant-groups-"));
    temporaryRoots.push(root);
    await fs.mkdir(path.join(root, "app"));
    await fs.writeFile(
      path.join(root, "app/page.tsx"),
      '<div className="md:(flex gap-4 hover:(text-white))" />',
    );

    const result = await postcss([
      variantGroups({ base: root }),
      tailwindcss({ base: root }),
    ]).process('@import "tailwindcss";', {
      from: path.join(root, "app.css"),
    });

    expect(result.css).toContain(".md\\:flex");
    expect(result.css).toContain(".md\\:gap-4");
    expect(result.css).toContain(".md\\:hover\\:text-white:hover");
    expect(result.css).toContain("@media");
  });

  it("does nothing for a stylesheet without a Tailwind import", async () => {
    const result = await postcss([variantGroups()]).process(".plain {}", {
      from: "plain.css",
    });
    expect(result.css).toBe(".plain {}");
  });
});
```

Add this cache, glob, ordering, and strict-error coverage using the same temporary-root
helper:

```ts
it("honors globs, sorts candidates, and invalidates changed files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "variant-groups-"));
  temporaryRoots.push(root);
  await fs.mkdir(path.join(root, "app"));
  await fs.mkdir(path.join(root, "ignored"));
  const page = path.join(root, "app/page.tsx");
  await fs.writeFile(page, '<div className="xl:(grid) md:(flex)" />');
  await fs.writeFile(
    path.join(root, "ignored/other.tsx"),
    '<div className="lg:(hidden)" />',
  );

  const processBridge = () =>
    postcss([
      variantGroups({
        base: root,
        include: ["app/**/*.tsx"],
        exclude: ["ignored/**"],
      }),
    ]).process('@import "tailwindcss";', {
      from: path.join(root, "app.css"),
    });

  const first = await processBridge();
  expect(first.css.indexOf("md:flex")).toBeLessThan(first.css.indexOf("xl:grid"));
  expect(first.css).not.toContain("lg:hidden");

  await fs.writeFile(page, '<div className="2xl:(grid grid-cols-2 gap-8)" />');
  const second = await processBridge();
  expect(second.css).toContain("2xl:grid");
  expect(second.css).toContain("2xl:grid-cols-2");
  expect(second.css).not.toContain("md:flex");
});

it("reports the malformed source filename in strict mode", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "variant-groups-"));
  temporaryRoots.push(root);
  await fs.mkdir(path.join(root, "app"));
  const page = path.join(root, "app/page.tsx");
  await fs.writeFile(page, 'const c = "md:(flex"');

  await expect(
    postcss([variantGroups({ base: root })]).process('@import "tailwindcss";', {
      from: path.join(root, "app.css"),
    }),
  ).rejects.toThrow(/app[\\/]page\.tsx:1:\d+/);
});
```

- [ ] **Step 2: Run the PostCSS test and confirm failure**

Run:

```bash
pnpm exec vitest run tests/postcss.test.ts
```

Expected: FAIL because `src/postcss.ts` does not exist.

- [ ] **Step 3: Implement source discovery and cache**

Define:

```ts
import type { PluginCreator } from "postcss";

export interface PostcssVariantGroupOptions {
  base?: string;
  include?: string[];
  exclude?: string[];
  strict?: boolean;
}

const variantGroups: PluginCreator<PostcssVariantGroupOptions>;
export default variantGroups;
```

Use these defaults:

```ts
const DEFAULT_INCLUDE = ["**/*.{js,jsx,ts,tsx}"];
const DEFAULT_EXCLUDE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
];
```

Resolve `base` from the option or `process.cwd()`. Discover absolute, file-only paths
with `fast-glob`. Cache `{ mtimeMs, size, candidates }` by absolute filename. Re-read
and re-transform only when metadata changes. Remove cache entries for files no longer
returned by the current scan. Merge all candidates into a `Set`, then sort with
`localeCompare` for deterministic output.

- [ ] **Step 4: Inject candidates and dependency messages**

Return a PostCSS plugin object with `postcssPlugin: "tailwind-variant-groups"` and an
async `Once` hook. First find an `@import` whose params begin with `"tailwindcss"` or
`'tailwindcss'`; return without scanning when absent. When candidates exist, create
exactly one at-rule:

```ts
postcss.atRule({
  name: "source",
  params: `inline(${JSON.stringify(candidates.join(" "))})`,
});
```

Insert it immediately after the Tailwind import so the later Tailwind PostCSS plugin
consumes it. Add a PostCSS `dependency` result message for every matched source file and
a `dir-dependency` message containing the base directory and include globs so new files
trigger rebuilds in compatible runners. Export `variantGroups.postcss = true` for
PostCSS configuration loading.

- [ ] **Step 5: Run the real Tailwind integration and complete suite**

Run:

```bash
pnpm exec vitest run tests/postcss.test.ts
pnpm test
pnpm typecheck
```

Expected: all commands PASS; the generated CSS contains the responsive and nested
selectors.

- [ ] **Step 6: Commit the PostCSS bridge**

```bash
git add src/postcss.ts tests/postcss.test.ts
git commit -m "feat: bridge grouped candidates into Tailwind"
```

### Task 6: Package Documentation and Dual-Bundler Next.js Fixture

**Files:**

- Create: `README.md`
- Create: `LICENSE`
- Create: `tests/fixtures/next-app/package.json`
- Create: `tests/fixtures/next-app/next.config.mjs`
- Create: `tests/fixtures/next-app/postcss.config.mjs`
- Create: `tests/fixtures/next-app/app/globals.css`
- Create: `tests/fixtures/next-app/app/layout.tsx`
- Create: `tests/fixtures/next-app/app/page.tsx`
- Create: `scripts/test-next-fixture.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: all package exports from Tasks 2 through 5.
- Produces: documented setup and an end-to-end compatibility gate for Turbopack and
  Webpack.

- [ ] **Step 1: Create the dual-bundler fixture runner**

Create `scripts/test-next-fixture.mjs` with helpers that resolve the package exports,
clear only the fixture's `.next` and `out` directories, spawn Next with telemetry
disabled, and inspect output files:

```js
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fg from "fast-glob";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/next-app");
const nextBin = path.join(repositoryRoot, "node_modules/next/dist/bin/next");

async function assertBuildArtifacts(mode) {
  const cssFiles = await fg(".next/**/*.css", {
    cwd: fixtureRoot,
    absolute: true,
  });
  assert.ok(cssFiles.length > 0, `${mode}: expected emitted CSS`);
  const css = (
    await Promise.all(cssFiles.map((file) => fs.readFile(file, "utf8")))
  ).join("\n");
  assert.match(css, /\.md\\:flex/);
  assert.match(css, /\.md\\:gap-4/);

  const serverFiles = await fg(".next/server/**/*.{html,rsc,txt,js}", {
    cwd: fixtureRoot,
    absolute: true,
  });
  const serverOutput = (
    await Promise.all(serverFiles.map((file) => fs.readFile(file, "utf8")))
  ).join("\n");
  assert.match(serverOutput, /md:flex/);
  assert.doesNotMatch(serverOutput, /md:\(flex/);
}

async function runBuild(mode, webpack) {
  await fs.rm(path.join(fixtureRoot, ".next"), {
    recursive: true,
    force: true,
  });
  await fs.rm(path.join(fixtureRoot, "out"), {
    recursive: true,
    force: true,
  });

  const child = spawnSync(
    process.execPath,
    [nextBin, "build", ...(webpack ? ["--webpack"] : [])],
    {
      cwd: fixtureRoot,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "inherit",
    },
  );
  assert.equal(child.status, 0, `${mode}: Next build failed`);
  await assertBuildArtifacts(mode);
}

await runBuild("turbopack", false);
await runBuild("webpack", true);
```

- [ ] **Step 2: Create the minimal Next.js fixture**

Create `tests/fixtures/next-app/package.json`:

```json
{
  "name": "tailwind-variant-groups-next-fixture",
  "private": true,
  "version": "0.0.0"
}
```

Use package self-references in `next.config.mjs`:

```js
import { withVariantGroups } from "tailwind-variant-groups/next";

export default withVariantGroups({});
```

Use an explicit fixture base in `postcss.config.mjs`:

```js
import { fileURLToPath } from "node:url";

export default {
  plugins: {
    "tailwind-variant-groups/postcss": {
      base: fileURLToPath(new URL(".", import.meta.url)),
    },
    "@tailwindcss/postcss": {},
  },
};
```

Create `app/globals.css` with:

```css
@import "tailwindcss";
```

Create `app/layout.tsx`:

```tsx
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `app/page.tsx`:

```tsx
export default function Page() {
  return (
    <main className="block md:(flex gap-4 hover:(bg-blue-500 text-white))">
      Variant groups
    </main>
  );
}
```

- [ ] **Step 3: Build the fixture with Turbopack and Webpack**

Run:

```bash
pnpm test:next
```

Expected: both builds PASS, emitted CSS contains `.md\:flex` and `.md\:gap-4`, server
output contains `md:flex`, and no server artifact contains `md:(flex`. A failure returns
implementation to the owning task; the fixture assertions must not be weakened.

- [ ] **Step 4: Write README and license**

Document these exact installation and configuration steps:

```bash
pnpm add -D tailwind-variant-groups
```

```ts
// next.config.ts
import { withVariantGroups } from "tailwind-variant-groups/next";

export default withVariantGroups({});
```

```js
// postcss.config.mjs
export default {
  plugins: {
    "tailwind-variant-groups/postcss": {},
    "@tailwindcss/postcss": {},
  },
};
```

Include basic, stacked, nested, arbitrary, and multiline examples; `strict`, `base`,
`include`, and `exclude` options; the complete compatibility matrix; the required plugin
ordering; the Tailwind raw-scan unused-CSS limitation; and explicit exclusions for
Tailwind 3, MDX, utility-prefix groups, and dynamic partial classes. Add the MIT license
using `tailwind-variant-groups contributors` as the copyright holder.

- [ ] **Step 5: Run all completion gates and inspect package contents**

Run:

```bash
pnpm format
pnpm verify
pnpm pack --dry-run
```

Expected: formatting, type checking, all Vitest tests, the package build, Turbopack
fixture build, Webpack fixture build, and dry-run packing PASS. The pack listing must
contain `dist/index`, `dist/next`, `dist/postcss`, `dist/loader.cjs`, declaration files,
source maps, `README.md`, and `LICENSE`, and must exclude source tests and fixture
output.

- [ ] **Step 6: Commit the verified package**

```bash
git add README.md LICENSE tests/fixtures scripts/test-next-fixture.mjs package.json pnpm-lock.yaml src tests tsup.config.ts
git commit -m "test: verify Next variant groups end to end"
```

### Task 7: Final Review and Release Readiness

**Files:**

- No source changes expected.
- Test: all commands in the package verification gate.

**Interfaces:**

- Consumes: the complete package from Tasks 1 through 6.
- Produces: a reproducibly verified package working under both supported Next bundlers.

- [ ] **Step 1: Review the complete diff against the specification**

Run:

```bash
git diff 9242d30..HEAD --check
git diff 9242d30..HEAD --stat
```

Read the spec and verify each acceptance condition against a named automated test. Pay
particular attention to malformed source locations, nested prefix accumulation, template
interpolation boundaries, existing Webpack callback return values, existing Turbopack
star rules, PostCSS ordering, and ESM/CommonJS loader resolution.

- [ ] **Step 2: Run the clean final verification**

Run:

```bash
pnpm verify
pnpm pack --dry-run
git diff 9242d30..HEAD --check
git status --short
```

Expected: verification and dry-run packing exit zero, the diff check prints no errors,
and `git status --short` is clean. Record the passing commands and the Turbopack/Webpack
build results in the implementation handoff.
