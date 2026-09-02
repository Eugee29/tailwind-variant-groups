# Final-fix report — Tailwind / Next compatibility and CJS declarations

Date: 2026-09-02

## Scope

This final-fix wave completes the release-readiness findings against base commit
`2535443d0ff5796e754de7419b203e066b2dfa2b`:

- Tailwind support is now `>=4.1 <5` and is exercised with exact Tailwind 4.1.0
  dependencies.
- Next support is now `>=16 <17`; there is no Next 15 compatibility claim or path.
- CommonJS consumers receive callable `/loader` and `/postcss` values with matching
  `export =` declarations.
- Static transform ranges are sorted by source start before candidate collection.
- The public Next wrapper output is structurally checked for the exact advanced Next 16
  Turbopack condition and all four source patterns.

No package was published.

## Predecessor-state assessment

The interrupted predecessor left a useful partial patch rather than a coherent final
fix:

- It correctly added the source-start sort and a mixed template-quasi/string-expression
  regression.
- It correctly introduced hand-written `types/loader.d.cts` and `types/postcss.d.cts`,
  copied them into `dist` after tsup, and added conditional PostCSS exports.
- It strengthened the Next test to compare the full public Turbopack condition. The
  production condition was already present; the source-file change was formatting only.
- It did **not** update package ranges, docs, or the lockfile to the approved floors.
- Its package consumer test resolved the ESM consumer without an ESM resolution mode, so
  it incorrectly expected `.d.ts` while TypeScript intentionally selected the CJS
  declaration branch. It also did not assert that its referenced declarations were in
  the dry-run package.

The partial implementation was preserved, then validated and completed rather than
discarded.

## Files changed

- `package.json` and `pnpm-lock.yaml`: public ranges, exact Tailwind 4.1 development
  gate, conditional declarations, and copy step.
- `README.md`, `docs/superpowers/specs/2026-09-01-tailwind-variant-groups-design.md`,
  and `docs/superpowers/plans/2026-09-01-tailwind-variant-groups.md`: compatible
  Tailwind 4.1–4.x / Next 16 wording and exact ranges, including the package snippet.
- `scripts/copy-cjs-declarations.mjs`, `types/loader.d.cts`, and `types/postcss.d.cts`:
  retained deterministic CJS declaration publishing.
- `scripts/test-package-types.mjs`: real CommonJS and ESM consumers, correctly
  mode-aware resolution checks, `import = require(...)` calls, runtime `require()` shape
  checks, and a dry-run package declaration manifest assertion.
- `src/core/transform.ts` and `tests/core/transform.test.ts`: source-start sorting and
  the source-order regression.
- `tests/next.test.ts`: exact public Next 16 condition assertion with `*.js`, `*.jsx`,
  `*.ts`, and `*.tsx` patterns.
- `tests/postcss.test.ts`: behavior-level Tailwind assertion that remains valid for the
  exact 4.1 floor's nested CSS serialization.

## Findings and rulings resolved

### A. Compatibility floors and behavioral gates

- Updated `tailwindcss` and `@tailwindcss/postcss` peers to `>=4.1 <5`.
- Updated the `next` peer to `>=16 <17` and removed `>=15.3 <17` claims from the README,
  specification, plan, and embedded package snippet.
- Pinned development `tailwindcss` and `@tailwindcss/postcss` to exact `4.1.0`, then ran
  the real PostCSS suite and the real Next Turbopack/Webpack fixture against that
  installation.
- `pnpm install` regenerated the lockfile accordingly.

Installed behavioral-gate versions:

| Package                | Version                      |
| ---------------------- | ---------------------------- |
| `tailwindcss`          | `4.1.0`                      |
| `@tailwindcss/postcss` | `4.1.0`                      |
| `next`                 | `16.3.3` (within `>=16 <17`) |

Tailwind 4.1 emits the generated hover utility as nested CSS rather than the flattened
selector emitted by the former 4.3 dependency. The test now asserts the generated
`md:hover:text-white` class itself, which is the package boundary contract and fails if
the candidate bridge stops injecting that expanded candidate.

### B. Callable CommonJS declarations and package contents

- `/postcss` now uses import/require conditional exports: ESM selects
  `dist/postcss.d.ts`; CommonJS selects `dist/postcss.d.cts`.
- `/loader` selects `dist/loader.d.cts` for its CommonJS-only export.
- Both CJS declarations use `export =` and describe callable functions. The package
  build copies them after tsup so generated default-export declarations cannot replace
  them.
- The consumer test creates actual `.cts` and `.mts` files. It compiles real
  `import loader = require(...)` and `import variantGroups = require(...)` calls, then
  calls actual `require()` exports and verifies they are functions with no required
  `.default` indirection.
- The resolver check now explicitly supplies `ts.ModuleKind.CommonJS` or
  `ts.ModuleKind.ESNext`; this corrected the predecessor's false failure for the ESM
  PostCSS consumer.
- The same consumer test executes `pnpm pack --dry-run --json` and asserts that
  `dist/loader.d.cts`, `dist/postcss.d.cts`, and `dist/postcss.d.ts` are present.

### C. Static-range source order

`transformVariantGroups()` sorts `findStaticRanges()` by `start` before transforming
ranges and collecting candidates. The regression mixes an initial template quasi, a
static string inside the interpolation, and a trailing quasi. Its expected candidate
order is `md:flex`, `hover:underline`, `lg:grid`.

### D. Exact Next 16 advanced condition

The test exercises the exported `withVariantGroups()` function and compares the returned
Turbopack configuration structurally. It requires exactly:

```ts
{
  all: [
    { not: "foreign" },
    {
      any: [
        { path: "*.js" },
        { path: "*.jsx" },
        { path: "*.ts" },
        { path: "*.tsx" },
      ],
    },
  ],
}
```

This uses the normal public configuration result; no production-only test hook was
introduced.

## RED / GREEN evidence

### Inherited focused checks

- Initial `pnpm exec vitest run tests/core/transform.test.ts tests/next.test.ts`:
  **GREEN**, 8 tests passed.
- Initial `pnpm test:package`: **RED**. The ESM resolver assertion failed because it
  called `ts.resolveModuleName()` without a resolution mode and therefore used the CJS
  branch. Independent runtime inspection confirmed both CJS modules were callable and
  their `.default` properties were `undefined`.
- After adding correct resolver modes and the manifest assertion: `pnpm test:package`:
  **GREEN**.

### Source-order mutation proof

- Temporarily removing the `start` sort produced the expected **RED**: the mixed-range
  test received `hover:underline` before `md:flex`.
- Restoring the sort produced **GREEN**: the transformer and exact Next tests passed, 8
  tests total.

### Tailwind floor proof

- After installing 4.1.0, `pnpm exec vitest run tests/postcss.test.ts` initially exposed
  a test-only **RED** tied to Tailwind 4.3's flattened CSS serialization.
- Replacing that serialization check with the generated expanded class contract made the
  real Tailwind 4.1 integration **GREEN**, 8 tests passed.
- `pnpm test:next` then built the fixture successfully with both Turbopack and
  `--webpack` using the same Tailwind 4.1 installation.

## Final gates

| Command               | Result                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`        | Passed; lockfile records exact Tailwind/PostCSS 4.1.0.                                                                    |
| `pnpm format`         | Passed.                                                                                                                   |
| `pnpm verify`         | Passed: Prettier check, TypeScript check, 27 Vitest tests, package consumer gate, Turbopack fixture, and Webpack fixture. |
| `pnpm pack --dry-run` | Passed.                                                                                                                   |
| `git diff --check`    | Passed with no whitespace errors.                                                                                         |

The final dry-run package contains the expected source maps and ESM/CJS artifacts,
including `dist/index.{js,cjs,d.ts,d.cts}`, `dist/next.{js,cjs,d.ts,d.cts}`,
`dist/postcss.{js,cjs,d.ts,d.cts}`, `dist/loader.cjs`, and `dist/loader.d.cts`, plus
`README.md` and `LICENSE`. It does not include source tests or fixture output.

## Self-review

- Re-read the binding specification, implementation plan, and ledger after the
  controller rulings.
- Confirmed all old `>=4 <5`, `>=15.3 <17`, Tailwind 4.3 dev-floor, and Next 15.3
  compatibility references were removed from package-facing documentation and plan
  snippets.
- Confirmed the only production behavior change in this wave is source-range ordering;
  the Next source itself needed no hook or semantic alteration because it already used
  the required v16 condition.
- Confirmed the CJS declaration copy is deterministic, build-time only, and its output
  is both consumer-tested and pack-tested.
- Confirmed no external publish, push, merge, reset, or unrelated cleanup occurred.

## Remaining concerns

No known functional concerns remain. The Next fixture resolves Next 16.3.3 through its
`^16.0.0` development range; this is inside the advertised Next 16-only support range,
and the exact v16 Turbopack condition is independently locked by a public structural
test. No package publication was requested or performed.
