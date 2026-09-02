# ESLint Plugin for Tailwind Variant Groups — Design

Date: 2026-09-02

## Summary

The repository will add a separately published companion package,
`eslint-plugin-tailwind-variant-groups`. It will format static Tailwind class lists by
canonicalizing utilities, collapsing compatible utilities into shorthands, sorting the
result with the project's Tailwind design system, and grouping repeated variant
prefixes.

The plugin will understand the grouped syntax produced for `tailwind-variant-groups`
instead of treating each whitespace-delimited fragment as an independent class. A flat
config compatibility preset will allow it to be installed alongside
`eslint-plugin-tailwindcss` while ensuring that only one plugin owns class-list fixes.

The first release targets Tailwind CSS 4.3 through 4.x, ESLint 9 and 10 flat config,
Node.js 20.19 or newer, and JavaScript, JSX, TypeScript, and TSX. Next.js 16 will be an
integration target rather than a runtime dependency.

## Goals

- Turn repeated variant prefixes into deterministic variant groups.
- Sort expanded Tailwind candidates according to the active Tailwind design system.
- Use Tailwind's canonicalization to replace unnecessary arbitrary values and collapse
  compatible utilities, such as `w-[8px] h-[8px]` to `size-2`.
- Understand existing basic, stacked, nested, and arbitrary variant groups.
- Report malformed group syntax at the relevant source range.
- Support static class lists in JSX attributes and configured helper calls.
- Co-install safely with `eslint-plugin-tailwindcss` through an explicit compatibility
  preset.
- Preserve unknown classes and decline fixes whenever safe formatting cannot be proven.
- Produce idempotent output without ESLint circular-fix behavior.

## Non-goals

- Tailwind CSS versions before 4.3.
- ESLint legacy `.eslintrc` configuration.
- MDX, Vue, Svelte, Astro, or other template syntaxes in the first release.
- Evaluating JavaScript, resolving variables, or formatting runtime-computed class
  expressions.
- Grouping across template-literal interpolations or across separate string literals.
- Reimplementing every rule from `eslint-plugin-tailwindcss` in the first release.
- Unknown-class and conflicting-class diagnostics in the first release.
- Running two class-list autofixers over the same source text.
- Enabling `prettier-plugin-tailwindcss` class sorting alongside this formatter.

## Package architecture

The repository will become a pnpm workspace with two publishable packages:

- `tailwind-variant-groups`: the existing build-time transformer, kept compatible with
  Tailwind CSS 4.1 through 4.x.
- `eslint-plugin-tailwind-variant-groups`: the new ESLint integration, requiring
  Tailwind CSS 4.3 or newer because candidate canonicalization first exists there.

The existing runtime package remains at the repository root to avoid an unnecessary
package move. The ESLint package lives under `packages/eslint-plugin`. The workspace
includes both `.` and `packages/*` in addition to existing test fixtures.

The runtime package will expose a narrowly scoped parser API for the ESLint package.
That API parses and expands variant groups without depending on Next.js, PostCSS, or
ESLint. The new package depends on a released compatible version of
`tailwind-variant-groups`; the workspace uses `workspace:*` during development and pnpm
rewrites it to a publishable version range when packed.

The ESLint package is divided into focused components:

- Source extraction locates eligible static class strings in the ESLint syntax tree.
- The group parser expands existing grouped syntax and reports precise syntax errors.
- A Tailwind adapter loads the project's stylesheet, validates and canonicalizes
  candidates, and obtains their class order.
- A formatter sorts flat candidates and serializes repeated contiguous variant prefixes
  as groups.
- ESLint rules translate formatter results into diagnostics and non-overlapping fixes.
- Flat-config presets enable the rules and coordinate with `eslint-plugin-tailwindcss`.

The Tailwind adapter contains all usage of Tailwind's currently unstable design-system
loading API. Keeping that dependency behind one interface makes version feature checks,
error messages, and future Tailwind API changes local to one module.

The ESLint package declares ESLint `>=9 <11` and Tailwind CSS `>=4.3 <5` as peer
dependencies. Its runtime dependencies include `tailwind-variant-groups`, a compatible
`@tailwindcss/node` 4.x range, and the synchronous worker bridge. The adapter first
resolves the project's compatible Tailwind node package so its design system matches the
application; its own dependency is the fallback. It feature-checks the canonicalization
API before producing edits instead of assuming every 4.x implementation exposes it.

## Supported source locations

The extractor handles these locations by default:

- Static `class="..."` and `className="..."` JSX attributes.
- String literals supplied to calls named `cn`, `clsx`, or `cva`.
- Nested string values in arrays and object values within those configured calls, which
  covers common conditional and variant configurations.
- Template literals without interpolations in the same locations.

Object property keys, import strings, directive prologues, and strings outside an
eligible attribute or configured call are not treated as class lists. Call and attribute
names are configurable through shared ESLint settings. Each eligible syntax node is
processed once even when configured calls are nested.

Template literals containing expressions and other runtime-computed values are left
unchanged as a whole. This conservative rule avoids grouping across values whose runtime
contents or token boundaries are unknown.

## Formatting pipeline

For each eligible static class string, the formatter performs these steps:

1. Parse the complete string and expand any existing variant groups into ordinary flat
   candidates.
2. Stop and return no formatting edit if the group structure is malformed; the
   `no-invalid-variant-groups` rule owns the syntax diagnostic.
3. Send the flat candidates to the Tailwind adapter for parsing, canonicalization,
   shorthand collapse, and class-order lookup.
4. Preserve candidates that Tailwind cannot safely canonicalize without deleting or
   rewriting their utility text. A candidate Tailwind can parse remains eligible for
   grouping even when it has no canonical replacement; a candidate Tailwind cannot parse
   is treated as an opaque grouping boundary.
5. Stably sort candidates using Tailwind's class order. Candidates without an order keep
   their relative order and use the same unknown-before-known placement as Tailwind's
   formatter.
6. Walk the sorted sequence and build groups for contiguous candidates that share a
   variant-prefix chain.
7. Serialize the result and replace the complete static string only when the output
   differs.

The worker uses Tailwind's `canonicalizeCandidates` operation with collapse enabled and
logical-to-physical conversion enabled. Pixel-to-rem canonicalization uses a
configurable `rootFontSize`, defaulting to `16`, so `w-[8px] h-[8px]` can become
`size-2` under the normal Tailwind root-size assumption. Setting canonicalization or
collapse off remains available as an advanced rule option, but both are enabled by the
recommended presets.

Example input:

```tsx
className =
  "p-4 md:w-[8px] md:h-[8px] md:mt-2 md:mb-2 md:hover:bg-red-500 md:hover:text-white";
```

Formatted output:

```tsx
className = "p-4 md:(size-2 my-2 hover:(bg-red-500 text-white))";
```

Grouping is based on exact parsed variant-prefix segments, not string splitting at every
colon. This preserves arbitrary variants, named groups, modifiers, and values containing
brackets, quotes, escapes, or colons.

Only a prefix shared by at least two candidates becomes a group. A prefix with one child
stays inline. For example:

```text
md:flex md:hover:bg-red-500
→ md:(flex hover:bg-red-500)
```

The nested `hover:` prefix is not wrapped around its single candidate. Groups are formed
only over contiguous runs in the sorted flattened sequence, so expanding the formatted
result reproduces that exact sequence. Running the formatter a second time produces no
additional changes.

## ESLint execution model

ESLint rule listeners are synchronous, while loading a Tailwind 4 design system is
asynchronous. The plugin therefore uses a synchronous worker bridge. A rule collects all
eligible strings in one file and sends one batch to the worker at `Program:exit`.

The worker caches loaded design systems by resolved stylesheet path and file metadata.
The initial implementation may also include dependency metadata in the cache key when
Tailwind exposes it reliably. Cache invalidation must prefer a reload over stale
results; an uncertain cache entry is never used to produce a fix.

Each returned edit covers one complete string node. Edits within one file cannot
overlap, and no partial utility edits are emitted. This prevents one rule pass from
temporarily moving a utility outside its variant group.

## Rules

### `tailwind-variant-groups/format-variant-groups`

A fixable layout rule that owns canonicalization, collapse, ordering, and grouping. The
recommended preset enables it as a warning so teams can adopt the formatter without
immediately breaking CI; projects may raise it to an error.

The rule accepts overrides for shared settings when file-specific behavior is required:

- `canonicalize`: default `true`.
- `collapse`: default `true`.
- `sort`: default `true`.
- `group`: default `true`.
- `rootFontSize`: default `16`.

The minimum group size is fixed at two in the first release rather than exposed as an
option.

### `tailwind-variant-groups/no-invalid-variant-groups`

A non-fixable correctness rule that reports an unmatched delimiter, unterminated group,
invalid nesting, or a group spanning unsupported source structure. The recommended
preset enables it as an error. Diagnostics identify the smallest useful source range and
include the parser's reason.

Unknown-class and conflicting-class rules are deferred. The compatibility preset makes
that reduced coverage explicit in its documentation rather than pretending the original
whitespace-tokenizing rules remain reliable for grouped input.

## Shared settings

The plugin uses a shared settings object:

```js
{
  settings: {
    "tailwind-variant-groups": {
      stylesheet: "./src/app/globals.css",
      callees: ["cn", "clsx", "cva"],
      attributes: ["class", "className"],
      rootFontSize: 16,
    },
  },
}
```

`stylesheet` is required and resolves from ESLint's current working directory. Tailwind
4 configuration lives in CSS and may include imports, custom utilities, variants, theme
tokens, and source directives, so guessing a stylesheet would risk using the wrong
design system. Windows and POSIX path forms are normalized before loading and caching.

Rule-level options override shared settings for the current configuration block. Invalid
types or values are rejected by the rule schema before formatting begins.

## Flat-config presets and coexistence

The package exports:

- `flat/recommended`: registers the plugin and enables its two initial rules.
- `flat/compat-tailwindcss`: enables the recommended rules and turns off every
  `tailwindcss/*` rule that tokenizes, validates, sorts, or fixes a class list as
  whitespace-separated text.

The compatibility preset must appear after the `eslint-plugin-tailwindcss` preset:

```js
import tailwindcss from "eslint-plugin-tailwindcss";
import variantGroups from "eslint-plugin-tailwind-variant-groups";

export default [
  tailwindcss.configs["flat/recommended"],
  variantGroups.configs["flat/compat-tailwindcss"],
  {
    settings: {
      "tailwind-variant-groups": {
        stylesheet: "./src/app/globals.css",
      },
    },
  },
];
```

Rules unrelated to Tailwind class strings continue to run. The documentation will list
the exact rules disabled for each tested `eslint-plugin-tailwindcss` release and explain
the diagnostics deferred by the MVP. Users who manually re-enable a conflicting rule
after the compatibility preset leave the supported configuration.

Plain Prettier remains supported. `prettier-plugin-tailwindcss` class sorting must be
disabled because it does not parse variant groups and could reorder a grouped fragment
as an unknown class. The ESLint plugin is the sole class-string formatter in this setup
and does not depend on the Prettier plugin.

## Error handling

The plugin declines to fix a string whenever continuing could change its meaning.

- Malformed groups produce a localized `no-invalid-variant-groups` diagnostic.
- A missing or unreadable stylesheet produces one actionable file-level configuration
  diagnostic and no class edits.
- Tailwind older than 4.3 produces one unsupported-version diagnostic.
- A Tailwind stylesheet loading failure includes the resolved path and the underlying
  message without exposing an unbounded stack trace for every class string.
- A parsed candidate that has no canonical form is preserved exactly but may still be
  sorted and grouped by its parsed variant chain. An unparsed candidate is preserved
  exactly, retains stable ordering among other unknown candidates, and acts as an opaque
  boundary during grouping.
- Worker failure returns no edits and one diagnostic rather than partially formatting a
  file.

Errors are deduplicated per source file. The plugin never removes a candidate solely
because Tailwind does not recognize it.

## Verification strategy

### Parser and formatter tests

Table-driven tests cover basic, stacked, nested, arbitrary, named, responsive, state,
container, and modifier variants. They verify exact expansion equivalence, contiguous
group formation, single-child behavior, stable unknown ordering, escaping, whitespace,
malformed input, and second-pass idempotence.

Canonicalization fixtures cover unnecessary arbitrary values, width-height and axis
collapses, logical-to-physical conversion, negative values, important modifiers, custom
theme tokens, and cases where no safe canonical form exists.

### ESLint rule tests

ESLint's rule tester covers JSX attributes, expression-container string literals,
configured attributes, configured helper calls, nested arrays and objects, static
templates, ignored interpolated templates, ignored unrelated strings, nested configured
calls, precise syntax ranges, autofix output, and non-overlapping edits.

### Semantic and integration tests

- Compile both a formatter input's flattened candidates and the formatted output's
  flattened candidates with real Tailwind, then compare the generated CSS.
- Run ESLint fixes twice and assert that the second run has no edits or circular-fix
  warning.
- Combine the tested `eslint-plugin-tailwindcss` recommended config with
  `flat/compat-tailwindcss` and assert that grouped strings receive no false warnings or
  semantics-changing fixes from the original plugin.
- Build and lint a minimal Next.js 16 fixture using TSX, `cn`, a custom Tailwind theme,
  and the repository's runtime variant-group transformer.
- Exercise Tailwind 4.3 and the latest supported Tailwind 4.x release, ESLint 9 and 10,
  and Windows and POSIX stylesheet paths in the compatibility matrix where CI permits.
- Pack the ESLint package, install the tarball into a clean consumer fixture, and verify
  ESM imports, CommonJS loading if exported, flat configs, rule metadata, and type
  declarations.

The repository completion gate runs formatting, type checking, unit tests, semantic
tests, ESLint integration tests, package-consumer tests, and the focused Next.js
fixture.

## Documentation and release

The root README will link the companion ESLint package without making it mandatory for
runtime users. The ESLint package README will include pnpm, npm, Yarn, and Bun install
commands; standalone and compatibility configurations; helper and attribute settings;
before-and-after examples; the Tailwind 4.3 requirement; and the Prettier ownership
note.

The two packages version and publish independently. Adding the workspace must not change
the existing `tailwind-variant-groups` public exports or its Tailwind 4.1 compatibility.

## Acceptance criteria

The feature is complete when a JavaScript or TypeScript project can install the ESLint
package, point it at a Tailwind 4.3+ stylesheet, run `eslint --fix`, and receive sorted,
canonicalized, collapsed, and deterministically grouped static class strings. The same
configuration must safely coexist with `eslint-plugin-tailwindcss` through the
documented compatibility preset, preserve custom and unrecognized classes, report
malformed groups, ignore runtime-computed strings, and produce no second-pass changes or
circular-fix warnings. The existing runtime package must retain its published API and
Tailwind 4.1+ support.
