# VS Code Hover Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local VS Code companion extension that replaces native Tailwind hover and shows application-aware CSS for ordinary classes, grouped classes with inherited variants, and complete group subtrees.

**Architecture:** Add an editor-neutral range-aware class-list tree to the root package, then consume it from a new `packages/vscode` extension. Keep document extraction, target resolution, Tailwind CSS generation, Markdown rendering, and the VS Code activation adapter separate so the behavior is testable without an extension host.

**Tech Stack:** TypeScript, VS Code Extension API, Babel parser, Tailwind CSS `@tailwindcss/node` design system, Vitest, tsup, `@vscode/vsce`, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-14-maximum-grouping-vscode-hover-design.md`

## Global Constraints

- Support JavaScript, JavaScript React, TypeScript, and TypeScript React only.
- Support VS Code `^1.96.0`, Tailwind CSS `>=4.3 <5`, and Node.js 20 or newer.
- Require an explicit workspace-relative `tailwindVariantGroups.stylesheet`.
- Default attributes are `class` and `className`; default callees are `cn`, `clsx`, and `cva`.
- Handle only static string literals and static template literals in this phase.
- Provide both ordinary and grouped hover; users disable only `tailwindCSS.hovers`.
- Do not add completion, diagnostics, color decorators, sorting, settings mutation, HTML/Vue/Svelte support, or Marketplace publication.
- Produce a local VSIX and keep generated VSIX files out of Git.

---

### Task 1: Range-aware class-list tree

**Files:**
- Create: `src/core/parse-class-list.ts`
- Modify: `src/core/expand-text.ts`
- Modify: `src/index.ts`
- Create: `tests/core/parse-class-list.test.ts`
- Modify: `tests/core/public-api.test.ts`

**Interfaces:**
- Produces:

```ts
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

export function parseVariantGroupClassList(
  text: string,
  options?: ExpandTextOptions,
): ClassListNode[];
```

- Keeps existing `expandVariantGroupsInText`, `splitTopLevelUtilities`, error type, and strictness behavior source-compatible.

- [ ] **Step 1: Write failing parser tests with hand-derived ranges**

Use one nested literal and assert the complete public tree:

```ts
const text = "p-4 md:(bg-red-500 hover:(text-white underline))";
const nodes = parseVariantGroupClassList(text);

expect(nodes[0]).toEqual({
  kind: "candidate",
  raw: "p-4",
  candidate: "p-4",
  range: { start: 0, end: 3 },
});
```

Assert literal ranges for the `md:` group, nested `hover:` group, `text-white` leaf,
opening/closing parentheses, and effective candidate `md:hover:text-white`. Add separate
cases for multiline whitespace, arbitrary values containing spaces/delimiters, escaped
characters, duplicate utilities, an empty group, unterminated strict input, and lenient
unterminated input.

Add a public API test importing `parseVariantGroupClassList` from `src/index.ts`.

- [ ] **Step 2: Run focused parser tests and verify RED**

```bash
pnpm test -- tests/core/parse-class-list.test.ts tests/core/public-api.test.ts
```

Expected: import failure because the parser and export do not exist.

- [ ] **Step 3: Implement one parser source of truth**

Move balanced token/group scanning into `parse-class-list.ts`. Preserve exact token
boundaries while recursively carrying `inheritedPrefix`. Construct candidate nodes for
ordinary tokens and group nodes for complete `prefix:(body)` forms. `range` values are
relative to the provided string; `options.offset` remains error-location metadata and
does not alter returned ranges.

Implement internal traversal helpers:

```ts
function parseSequence(
  text: string,
  start: number,
  end: number,
  inheritedPrefix: string,
  options: ExpandTextOptions,
): ClassListNode[];

function flattenCandidates(nodes: readonly ClassListNode[]): string[];
```

Refactor `expandVariantGroupsInText` to call the new parser and serialize candidate
nodes to `candidate`, while preserving untouched source between parsed nodes. Keep
`validateDelimiters` behavior and all existing test-visible error offsets.

- [ ] **Step 4: Run parser and existing core tests and verify GREEN**

```bash
pnpm test -- tests/core/parse-class-list.test.ts tests/core/expand-text.test.ts tests/core/strict-delimiters.test.ts tests/core/public-api.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 5: Run root unit and type checks**

```bash
pnpm typecheck
pnpm test
```

Expected: zero TypeScript diagnostics and all runtime unit tests pass.

- [ ] **Step 6: Commit the shared parser**

```bash
git add src/core src/index.ts tests/core
git commit -m "feat: expose range-aware variant group parsing"
```

### Task 2: VS Code package scaffold and static class-list extraction

**Files:**
- Create: `packages/vscode/package.json`
- Create: `packages/vscode/tsconfig.json`
- Create: `packages/vscode/tsup.config.ts`
- Create: `packages/vscode/vitest.config.ts`
- Create: `packages/vscode/src/class-lists.ts`
- Create: `packages/vscode/tests/class-lists.test.ts`
- Modify: `.gitignore`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `parseVariantGroupClassList` and node types from `tailwind-variant-groups`.
- Produces:

```ts
export interface ExtractClassListOptions {
  attributes: ReadonlySet<string>;
  callees: ReadonlySet<string>;
}

export interface ExtractedClassList {
  text: string;
  range: TextRange;
  nodes: ClassListNode[];
}

export function extractStaticClassLists(
  source: string,
  filename: string,
  options: ExtractClassListOptions,
): ExtractedClassList[];
```

- [ ] **Step 1: Add package test scaffolding and a failing extraction test**

Create package metadata named `tailwind-variant-groups-vscode` version `0.1.0`, publisher
`eugee29`, display name `Tailwind Variant Groups`, private for this phase, with VS Code
engine `^1.96.0` and main entry `./dist/extension.cjs`. Add workspace dependency
`tailwind-variant-groups: workspace:*`, runtime dependencies `@babel/parser` and
`@tailwindcss/node`, and development dependencies for VS Code types, Vitest, tsup, and
VSIX packaging. Add scripts `build`, `typecheck`, `test`, `package:vsix`, and `verify`.

Test JSX attributes, configured callees, nested arrays/objects/conditionals, ignored
unconfigured strings, and static template literals. Use literal document offsets:

```ts
const source = `export const Page = () => (
  <div className="md:(bg-red-500 hover:text-white)" />
);`;

expect(extractStaticClassLists(source, "page.tsx", defaults)).toEqual([
  expect.objectContaining({
    text: "md:(bg-red-500 hover:text-white)",
    range: {
      start: source.indexOf("md:("),
      end: source.indexOf("md:(") + "md:(bg-red-500 hover:text-white)".length,
    },
  }),
]);
```

- [ ] **Step 2: Install dependencies and verify RED**

```bash
pnpm install
pnpm --filter tailwind-variant-groups-vscode test -- tests/class-lists.test.ts
```

Expected: test import failure because `src/class-lists.ts` does not exist.

- [ ] **Step 3: Implement Babel-based context extraction**

Parse according to `.js`, `.jsx`, `.ts`, and `.tsx` using the root project's existing
Babel conventions. Visit configured JSX attributes and direct configured identifier
callees. Recursively inspect arrays, object values, conditionals, logical expressions,
spreads, and TypeScript/parenthesized wrappers. Emit only complete static string and
static template literals. Parse each extracted text with `parseVariantGroupClassList`.

Do not inspect arbitrary string literals and do not support member-expression callees or
dynamic templates in this phase.

- [ ] **Step 4: Run focused extraction tests and verify GREEN**

```bash
pnpm --filter tailwind-variant-groups-vscode test -- tests/class-lists.test.ts
```

Expected: all extraction tests pass.

- [ ] **Step 5: Commit package extraction slice**

```bash
git add .gitignore packages/vscode package.json pnpm-lock.yaml
git commit -m "feat(vscode): extract static Tailwind class lists"
```

### Task 3: Hover target resolution and rendering model

**Files:**
- Create: `packages/vscode/src/hover-target.ts`
- Create: `packages/vscode/src/hover-markdown.ts`
- Create: `packages/vscode/tests/hover-target.test.ts`
- Create: `packages/vscode/tests/hover-markdown.test.ts`

**Interfaces:**
- Produces:

```ts
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

export function findHoverTarget(
  lists: readonly ExtractedClassList[],
  documentOffset: number,
): HoverTarget | undefined;

export function renderHoverMarkdown(
  target: HoverTarget,
  cssByCandidate: readonly (string | null)[],
): string | undefined;
```

- [ ] **Step 1: Write failing target-selection tests**

Assert these literal behaviors:

- ordinary `p-4` returns a one-candidate target;
- grouped `text-white` returns `md:hover:text-white` and the leaf's range;
- `hover:` prefix and either parenthesis return only the nested subtree candidates;
- `md:` prefix and parentheses return the complete outer subtree;
- candidate text wins over enclosing group;
- whitespace inside a group produces no target;
- document offsets are translated from class-list-relative ranges exactly.

- [ ] **Step 2: Run target tests and verify RED**

```bash
pnpm --filter tailwind-variant-groups-vscode test -- tests/hover-target.test.ts
```

Expected: import failure because target resolution does not exist.

- [ ] **Step 3: Implement smallest-node target resolution**

Find the containing extracted class list, convert to a relative offset, and recursively
walk its nodes. Return a candidate when inside candidate text. Return a group only when
inside its `prefixRange`, at `openParen`, or at `closeParen`. Recurse into nested groups
before selecting the enclosing group.

- [ ] **Step 4: Run target tests and verify GREEN**

Run the same focused command. Expected: all target tests pass.

- [ ] **Step 5: Write failing Markdown rendering tests**

For one candidate, expect a CSS fenced block and its effective candidate label. For a
group, expect an `Expanded candidates` list in source-tree order followed by one CSS
fence containing every non-null CSS result. Assert that an individual all-null result
returns `undefined`, while a group still lists unknown candidates and includes CSS for
known siblings.

- [ ] **Step 6: Implement pure Markdown rendering and verify GREEN**

Implement `renderHoverMarkdown` without importing `vscode`. Escape Markdown-sensitive
candidate labels by placing them in inline-code spans with a delimiter longer than any
backtick run in the candidate. Join CSS results with one blank line and never emit an
empty CSS fence.

Run:

```bash
pnpm --filter tailwind-variant-groups-vscode test -- tests/hover-target.test.ts tests/hover-markdown.test.ts
```

Expected: both files pass.

- [ ] **Step 7: Commit hover model behavior**

```bash
git add packages/vscode/src packages/vscode/tests
git commit -m "feat(vscode): resolve grouped hover targets"
```

### Task 4: Tailwind v4 CSS preview service

**Files:**
- Create: `packages/vscode/src/tailwind-preview.ts`
- Create: `packages/vscode/tests/tailwind-preview.test.ts`
- Create: `packages/vscode/tests/fixtures/tailwind.css`

**Interfaces:**
- Produces:

```ts
export interface TailwindPreviewService {
  candidatesToCss(stylesheet: string, candidates: readonly string[]): Promise<(string | null)[]>;
  invalidate(stylesheet?: string): void;
}

export function createTailwindPreviewService(): TailwindPreviewService;
```

- [ ] **Step 1: Write failing real-Tailwind preview tests**

The fixture imports Tailwind and defines one custom theme color and one `@utility`.
Assert literal CSS fragments for:

- `p-4`;
- `md:hover:bg-brand` including its media/hover wrappers;
- the custom utility;
- an unknown candidate returning `null`;
- two calls with unchanged stylesheet returning identical output;
- `invalidate(stylesheet)` followed by a fixture change causing reloaded output, with the
  temporary changing stylesheet created under the test temp directory.

- [ ] **Step 2: Run the preview test and verify RED**

```bash
pnpm --filter tailwind-variant-groups-vscode test -- tests/tailwind-preview.test.ts
```

Expected: import failure because the service does not exist.

- [ ] **Step 3: Implement workspace-relative Tailwind loading and caching**

Resolve `@tailwindcss/node` and `tailwindcss/package.json` from the stylesheet using
`createRequire(stylesheet)`, with the extension's bundled dependency as fallback. Reject
versions outside `>=4.3 <5`. Load CSS with `__unstable__loadDesignSystem` and call
`candidatesToCss([...candidates])`.

Cache self-contained stylesheets by resolved path and exact CSS contents. Treat any
`@import`, `@reference`, `@config`, or `@plugin` other than the direct Tailwind import as
uncacheable, matching the ESLint adapter. `invalidate()` clears one normalized path or
the complete cache.

- [ ] **Step 4: Run preview tests and verify GREEN**

Run the same focused command. Expected: every real-Tailwind preview test passes.

- [ ] **Step 5: Run package typecheck and unit suite**

```bash
pnpm --filter tailwind-variant-groups-vscode typecheck
pnpm --filter tailwind-variant-groups-vscode test
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit Tailwind preview generation**

```bash
git add packages/vscode/src/tailwind-preview.ts packages/vscode/tests
git commit -m "feat(vscode): generate Tailwind CSS hover previews"
```

### Task 5: VS Code activation adapter and configuration

**Files:**
- Create: `packages/vscode/src/settings.ts`
- Create: `packages/vscode/src/provider.ts`
- Create: `packages/vscode/src/extension.ts`
- Create: `packages/vscode/tests/provider.test.ts`
- Create: `packages/vscode/tests/extension.test.ts`
- Modify: `packages/vscode/package.json`
- Modify: `packages/vscode/tsup.config.ts`

**Interfaces:**
- Consumes: extraction, target resolution, Markdown rendering, and Tailwind preview service from Tasks 2-4.
- Produces: VS Code `activate(context)` registering one hover provider for the four supported language IDs.

- [ ] **Step 1: Write failing provider behavior tests**

Exercise a real source string and real class-list parser while injecting only the CSS
preview boundary. Assert that the provider core:

- resolves configured attributes/callees;
- maps the VS Code-style offset to the correct effective candidates;
- passes those exact candidates to the preview service;
- returns the exact Markdown string and target range;
- returns no result when hovers are disabled, stylesheet is missing, source is malformed,
  the request is cancelled, or every candidate is unsupported.

- [ ] **Step 2: Run provider tests and verify RED**

```bash
pnpm --filter tailwind-variant-groups-vscode test -- tests/provider.test.ts
```

Expected: import failure because provider core does not exist.

- [ ] **Step 3: Implement settings and provider core**

Resolve the stylesheet relative to the document's workspace folder and expose the
defaults from the spec. Cache extracted class lists by `{uri, version}`. Do not import
the VS Code module in the core provider; accept document text, filename, version, offset,
resolved settings, cancellation predicate, and preview service through a typed request.

- [ ] **Step 4: Run provider tests and verify GREEN**

Run the focused command again. Expected: all provider tests pass.

- [ ] **Step 5: Write a failing thin activation test**

Mock only the `vscode` host boundary with complete shapes used by `activate`. Assert our
extension registers one provider whose selector contains `javascript`,
`javascriptreact`, `typescript`, and `typescriptreact`; creates one output channel;
registers a stylesheet watcher; and disposes all registrations through
`context.subscriptions`.

- [ ] **Step 6: Implement the VS Code adapter and verify GREEN**

`activate` reads `tailwindVariantGroups` settings at hover time, calls the pure provider,
converts offsets/ranges through `TextDocument`, and returns `new vscode.Hover` with a
trusted-false `MarkdownString`. It logs each distinct configuration/load failure once.
The watcher invalidates the preview cache on create/change/delete. If
`tailwindCSS.hovers` is not `false`, write one coexistence warning to the output channel
without changing settings or showing repeated notifications.

Run:

```bash
pnpm --filter tailwind-variant-groups-vscode test -- tests/provider.test.ts tests/extension.test.ts
```

Expected: both files pass.

- [ ] **Step 7: Commit activation**

```bash
git add packages/vscode
git commit -m "feat(vscode): register Tailwind variant group hovers"
```

### Task 6: VSIX packaging, documentation, and repository verification

**Files:**
- Create: `packages/vscode/README.md`
- Create: `packages/vscode/scripts/test-package.mjs`
- Modify: `packages/vscode/package.json`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: compiled extension from Task 5.
- Produces: local VSIX, package smoke proof, root verification integration, and installation instructions.

- [ ] **Step 1: Write the package smoke script before packaging changes**

The script runs `vsce ls --yarn false` and fails unless the packaged file list includes
`dist/extension.cjs`, `package.json`, and `README.md` while excluding `src`, `tests`, and
fixtures. It then imports the compiled pure provider entry and executes one grouped
hover against the real fixture stylesheet, asserting `md:hover:` CSS is present.

- [ ] **Step 2: Run the package smoke script and verify RED**

```bash
pnpm --filter tailwind-variant-groups-vscode build
node packages/vscode/scripts/test-package.mjs
```

Expected: failure because package files/build entries are not finalized.

- [ ] **Step 3: Finalize build and VSIX package metadata**

Bundle the extension as CommonJS with `vscode` external. Expose a bundled pure-provider
entry only for the smoke script. Set activation events for the four supported language
IDs and contribute the four exact settings from the design. Add `.vscodeignore` so only
runtime assets ship. Add `*.vsix` to `.gitignore`.

Add root scripts:

```json
{
  "test:vscode": "pnpm --filter tailwind-variant-groups-vscode verify",
  "verify": "pnpm format:check && pnpm typecheck && pnpm test && pnpm test:package && pnpm test:eslint && pnpm test:vscode && pnpm test:next"
}
```

- [ ] **Step 4: Run package verification and create the local VSIX**

```bash
pnpm --filter tailwind-variant-groups-vscode verify
pnpm --filter tailwind-variant-groups-vscode package:vsix
```

Expected: verification exits 0 and one ignored `.vsix` file is created under
`packages/vscode`.

- [ ] **Step 5: Document installation and coexistence**

Document:

```json
{
  "tailwindCSS.hovers": false,
  "tailwindVariantGroups.hovers": true,
  "tailwindVariantGroups.stylesheet": "./app/globals.css"
}
```

Explain local installation with VS Code's `Extensions: Install from VSIX...` command and
CLI `code --install-extension <file>.vsix`. State that Tailwind IntelliSense continues
to provide completions, diagnostics, colors, and other features. Include individual,
outer-group, and nested-group hover examples.

- [ ] **Step 6: Run full fresh repository verification**

```bash
pnpm install --frozen-lockfile
pnpm verify
git diff --check
```

Expected: installation is lockfile-stable; every runtime, package, ESLint, VS Code, and
Next.js gate exits 0; no whitespace errors.

- [ ] **Step 7: Commit package and documentation**

```bash
git add .gitignore package.json pnpm-lock.yaml README.md packages/vscode
git commit -m "feat(vscode): package variant group hover companion"
```
