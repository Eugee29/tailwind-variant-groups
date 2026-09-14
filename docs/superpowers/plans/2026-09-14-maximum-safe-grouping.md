# Maximum-Safe Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the default ESLint formatter group every safely movable repeated variant prefix while preserving exact candidate semantics and the `sort: false` source-order contract.

**Architecture:** Keep Tailwind analysis as the authority for whether a candidate has an exact, unambiguous decomposition. When sorting is enabled, serialize consecutive parsed runs through an ordered prefix trie; opaque candidates split runs. Keep the existing contiguous serializer for `sort: false`.

**Tech Stack:** TypeScript, Tailwind CSS 4.3 design-system APIs, Vitest, ESLint 9/10 flat config, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-14-maximum-grouping-vscode-hover-design.md`

## Global Constraints

- Maximum-safe grouping is the default only under the existing default `sort: true`.
- `sort: false` must preserve source order and therefore keeps contiguous-only grouping.
- Never reorder variant segments inside a candidate.
- Never move a parsed candidate across an opaque or ambiguous candidate.
- Preserve duplicates and the exact expanded-candidate multiset.
- Support Tailwind CSS `>=4.3 <5`, ESLint `>=9 <11`, and Node.js `>=20.19`.
- Do not change runtime expansion or browser behavior.

---

### Task 1: Ordered prefix-trie serialization

**Files:**
- Modify: `packages/eslint-plugin/tests/formatter.test.ts`
- Modify: `packages/eslint-plugin/src/formatter.ts`

**Interfaces:**
- Consumes: `AnalyzedCandidate` from `packages/eslint-plugin/src/protocol.ts`.
- Produces: existing `serializeVariantGroups(items, options): string` with new default behavior when `options.sort && options.group` are both true.
- Keeps: `sortAnalyzedCandidates(items): AnalyzedCandidate[]` and the contiguous serializer for `sort: false`.

- [ ] **Step 1: Write failing maximum-grouping tests**

Add literal expectations covering top-level and nested noncontiguous prefixes, exact
variant-chain order, opaque barriers, duplicate leaves, and `sort: false`:

```ts
it("maximally groups safely movable prefixes after Tailwind sorting", () => {
  const values = [
    candidate("hover:border-purple-500", ["hover"], "border-purple-500", "1", 0),
    candidate("hover:bg-red-500", ["hover"], "bg-red-500", "2", 1),
    candidate("md:bg-yellow-500", ["md"], "bg-yellow-500", "3", 2),
    candidate("hover:md:bg-amber-500", ["hover", "md"], "bg-amber-500", "4", 3),
  ];

  expect(serializeVariantGroups(values, { sort: true, group: true })).toBe(
    "hover:(border-purple-500 bg-red-500 md:bg-amber-500) md:bg-yellow-500",
  );
});

it("does not move candidates across opaque barriers", () => {
  const values = [
    candidate("hover:flex", ["hover"], "flex", "1", 0),
    candidate("custom-token", [], "custom-token", null, 1, false),
    candidate("hover:grid", ["hover"], "grid", "2", 2),
  ];

  expect(serializeVariantGroups(values, { sort: true, group: true })).toBe(
    "custom-token hover:(flex grid)",
  );
});

it("keeps contiguous-only grouping when sorting is disabled", () => {
  const values = [
    candidate("hover:flex", ["hover"], "flex", "1", 0),
    candidate("md:block", ["md"], "block", "2", 1),
    candidate("hover:grid", ["hover"], "grid", "3", 2),
  ];

  expect(serializeVariantGroups(values, { sort: false, group: true })).toBe(
    "hover:flex md:block hover:grid",
  );
});
```

Include a nested case where `hover:focus:*` entries are separated by another recognized
`hover:*` child and a duplicate case that emits both leaves.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter eslint-plugin-tailwind-variant-groups test -- tests/formatter.test.ts
```

Expected: the new maximum-grouping assertions fail because `serializeAtDepth` only joins
contiguous runs. Existing assertions remain green.

- [ ] **Step 3: Implement the minimal ordered trie**

Add private structures whose output order is defined by first occurrence:

```ts
interface TrieNode {
  entries: TrieEntry[];
  variants: Map<string, VariantEntry>;
  leafCount: number;
}

type TrieEntry = UtilityEntry | VariantEntry;

interface UtilityEntry {
  kind: "utility";
  utility: string;
}

interface VariantEntry {
  kind: "variant";
  variant: string;
  node: TrieNode;
}
```

Implement these private functions:

```ts
function buildPrefixTrie(items: readonly AnalyzedCandidate[]): TrieNode;
function serializePrefixTrie(node: TrieNode): string[];
function serializeMaximumParsedRuns(items: readonly AnalyzedCandidate[]): string[];
```

`buildPrefixTrie` walks each candidate's existing `variants` array. The first encounter
with a variant appends a `VariantEntry` to the current node and stores it in `variants`;
later encounters reuse it. A utility appends a separate `UtilityEntry`, including
duplicates. Increment `leafCount` on every node in the candidate path.

`serializePrefixTrie` emits entries in first-occurrence order. A variant child with
`leafCount >= 2` becomes `variant:(<serialized children>)`; a child with one leaf becomes
`variant:<only serialized child>`.

`serializeMaximumParsedRuns` scans the sorted candidates, passes each consecutive parsed
run to the trie, and emits every opaque candidate unchanged between runs.

Select serializers without changing the public options shape:

```ts
if (!options.group) return ordered.map((item) => item.raw).join(" ");
return options.sort
  ? serializeMaximumParsedRuns(ordered).join(" ")
  : serializeAtDepth(ordered, 0).join(" ");
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same focused command. Expected: all formatter tests pass with no warnings.

- [ ] **Step 5: Run the ESLint package unit suite**

Run:

```bash
pnpm --filter eslint-plugin-tailwind-variant-groups test
```

Expected: all package unit tests pass. Update old literal formatter expectations only
when their new output follows the approved maximum-safe rule.

- [ ] **Step 6: Commit the trie behavior**

```bash
git add packages/eslint-plugin/src/formatter.ts packages/eslint-plugin/tests/formatter.test.ts
git commit -m "feat(eslint): maximize safe variant grouping"
```

### Task 2: Semantic equivalence and formatter integration proof

**Files:**
- Modify: `packages/eslint-plugin/tests/semantic-equivalence.test.ts`
- Modify: `packages/eslint-plugin/tests/rules/format-variant-groups.test.ts`
- Modify: `packages/eslint-plugin/README.md`

**Interfaces:**
- Consumes: maximum-safe `serializeVariantGroups` from Task 1 and existing real Tailwind analyzer.
- Produces: regression proof that reordered grouping expands to the same candidates and CSS declarations; documents the `sort` interaction.

- [ ] **Step 1: Write failing real-Tailwind and rule-level tests**

Add a semantic fixture with separated `hover:` candidates:

```ts
const input = [
  "hover:border-purple-500",
  "hover:bg-red-500",
  "md:bg-yellow-500",
  "hover:md:bg-amber-500",
];
```

Analyze with `canonicalize: false`, serialize with `{ sort: true, group: true }`, and
assert the approved literal output. Expand the output and assert a hand-derived sorted
copy of its candidates equals a hand-derived sorted copy of `input`. Compile both lists
with the real Tailwind design system and compare the existing declaration signatures.

Add an ESLint rule valid case whose `output` is:

```tsx
<div className="hover:(border-purple-500 bg-red-500 md:bg-amber-500) md:bg-yellow-500" />
```

Run the fixed output through the rule a second time and assert no further messages.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm --filter eslint-plugin-tailwind-variant-groups test -- tests/semantic-equivalence.test.ts tests/rules/format-variant-groups.test.ts
```

Expected: at least the new rule output assertion fails before fixtures are aligned with
the maximum serializer.

- [ ] **Step 3: Make only integration-level expectation changes required by Task 1**

Do not add another grouping implementation. Use the existing rule and analyzer path.
If Tailwind sorting changes the literal order, derive the literal from the observed
Tailwind order once, then retain the independently checked expanded-candidate and
declaration comparisons.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the focused command again. Expected: both files pass.

- [ ] **Step 5: Document maximum-safe behavior**

Update the formatting section to state:

- default `sort: true` performs maximum-safe grouping after Tailwind ordering;
- exact variant chains are never reordered;
- opaque candidates are barriers;
- `sort: false` retains contiguous-only grouping to preserve source order.

Include the approved `hover`/`md` example and its output.

- [ ] **Step 6: Verify the complete ESLint package**

Run:

```bash
pnpm --filter eslint-plugin-tailwind-variant-groups verify
```

Expected: formatting, typechecking, unit tests, worker test, packed-package checks, and
ESLint 9/10 compatibility all exit 0.

- [ ] **Step 7: Commit semantic proof and documentation**

```bash
git add packages/eslint-plugin/tests packages/eslint-plugin/README.md
git commit -m "test(eslint): prove maximum grouping equivalence"
```

### Task 3: Root regression gate

**Files:**
- No production files expected.

**Interfaces:**
- Consumes: completed Tasks 1-2.
- Produces: proof that maximum grouping does not regress runtime, package types, PostCSS, or Next.js integrations.

- [ ] **Step 1: Run root checks relevant to changed code**

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:eslint
```

Expected: every command exits 0.

- [ ] **Step 2: Inspect the diff for scope and whitespace errors**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and only plan-approved files are modified.

- [ ] **Step 3: Commit any mechanical formatting corrections separately**

Only if Step 1 required formatting changes:

```bash
git add packages/eslint-plugin
git commit -m "style(eslint): format maximum grouping changes"
```

