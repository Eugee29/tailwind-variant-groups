# Tailwind Variant Groups for Next.js — Design

Date: 2026-09-01

## Summary

`tailwind-variant-groups` will add UnoCSS-style variant grouping to Tailwind CSS 4.1–4.x
projects using Next.js 16. Authors will be able to write grouped breakpoint, state,
arbitrary, and container variants in JavaScript and TypeScript sources while Tailwind
receives ordinary static candidates and React renders ordinary class names.

The first release targets Tailwind CSS 4.1.x through 4.x, Next.js 16.x, Node.js 20.9 or
newer, JavaScript and TypeScript component files, and both Turbopack and Webpack. MDX
and utility-prefix grouping are outside the initial scope.

## Goals

- Expand variant groups such as `md:(flex gap-4)` into ordinary Tailwind classes.
- Support stacked and nested variants without changing their meaning.
- Work in `.js`, `.jsx`, `.ts`, and `.tsx` files.
- Generate the necessary Tailwind CSS under both Turbopack and Webpack.
- Preserve existing Next.js Webpack callbacks and Turbopack rules.
- Fail with actionable source locations for malformed groups.
- Add no runtime dependency or browser-side transformation.

## Non-goals

- Tailwind CSS 3 compatibility.
- MDX transformation.
- UnoCSS utility-prefix grouping such as `font-(bold mono)`.
- Dynamic construction of partial Tailwind classes.
- Replacing Tailwind's source scanner or suppressing every incidental class it may
  detect in the original grouped text.

## Syntax

The transformer supports basic variant groups:

```tsx
<div className="md:(flex gap-4 items-center)" />
```

It supports stacked variants:

```tsx
<div className="md:hover:(bg-blue-500 text-white)" />
```

It supports nested variants:

```tsx
<div className="md:(flex hover:(bg-blue-500 text-white))" />
```

It supports arbitrary variants and values:

```tsx
<div className="[&>svg]:(size-5 fill-current) md:(grid grid-cols-[1fr_2fr])" />
```

It supports whitespace and newlines between grouped utilities:

```tsx
<div
  className="md:(
  flex
  gap-4
  items-center
)"
/>
```

Nested expansion accumulates variant prefixes:

```text
md:(flex hover:(underline text-blue-500))
→ md:flex md:hover:underline md:hover:text-blue-500
```

The parser splits grouped contents only on whitespace outside balanced brackets, quotes,
braces, and parentheses. It preserves Tailwind-compatible arbitrary values, arbitrary
variants, named groups, container variants, and chained variants.

Groups may not span a JavaScript template interpolation. An expression such as
`md:(bg-${color})` fails in strict mode because Tailwind cannot statically discover the
resulting class. Complete static groups within a template literal remain valid.

## Architecture

The package contains one transformation core and two coordinated build integrations.

### Core transformer

`transformVariantGroups(source, options)` is a pure transformation API. It parses
JavaScript or TypeScript only after a cheap `:(` marker check, visits static string
literals and individual static template-literal segments, finds balanced variant-group
expressions within those ranges, recursively expands them, and returns transformed code,
generated candidates, change metadata, and a source map when requested.

The parser recognizes only variant groups whose prefix ends in `:` before the opening
parenthesis. It does not expand utility-prefix expressions such as `font-(bold mono)`.

`@babel/parser` locates transformable source ranges without installing a Babel
configuration or replacing Next.js's SWC compiler. The transformer walks the returned
syntax tree directly, so it does not require Babel's code generator or traversal
packages. Comments, regular expressions, import specifiers, and executable syntax are
not rewritten. A group must begin and end within one static string literal or one
template-literal segment; this makes the template-interpolation restriction
deterministic.

### Next.js integration

`withVariantGroups(nextConfig, options)` installs a webpack-compatible pre-loader for
`.js`, `.jsx`, `.ts`, and `.tsx` sources.

For Turbopack, the wrapper adds a `turbopack.rules` entry restricted to non-foreign
JavaScript and TypeScript sources. For Webpack, it adds an `enforce: "pre"` module rule
and excludes dependencies. The wrapper merges existing Turbopack rules and invokes any
existing user Webpack callback without discarding its returned configuration.

The loader uses the core transformer before Next.js compiles the module. React therefore
receives ordinary class strings such as `md:flex md:gap-4`. Files without a
variant-group marker return immediately without allocation-heavy parsing.

### PostCSS integration

The Next.js loader output is not visible to Tailwind because Tailwind 4.1 scans original
files directly from disk. A companion PostCSS plugin therefore uses the same parser to
scan configured source files and collect expanded candidates.

The PostCSS plugin runs before `@tailwindcss/postcss` and inserts the expanded
candidates as `@source inline(...)` directives. Tailwind then generates the required
responsive, state, arbitrary, and container-query CSS while retaining its normal
automatic detection for ungrouped classes.

The scanner defaults to `**/*.{js,jsx,ts,tsx}` under the project root and excludes
`node_modules`, `.next`, `dist`, `build`, Git metadata, and coverage output. Users can
override the base path, inclusion globs, and exclusion globs for monorepos or unusual
layouts.

Files are cached by stable file metadata, expanded candidates are deduplicated, and
injected candidates are sorted for deterministic builds. Tailwind may independently
recognize some unprefixed utilities inside the original grouped text, which can add a
small amount of unused CSS. This does not change runtime behavior or omit required
styles.

## Public API

Next.js configuration:

```ts
import { withVariantGroups } from "tailwind-variant-groups/next";

export default withVariantGroups(
  {
    // Existing Next.js configuration.
  },
  {
    strict: true,
  },
);
```

PostCSS configuration:

```js
export default {
  plugins: {
    "tailwind-variant-groups/postcss": {
      base: process.cwd(),
      include: ["**/*.{js,jsx,ts,tsx}"],
      exclude: ["node_modules/**", ".next/**", "dist/**", "build/**"],
      strict: true,
    },
    "@tailwindcss/postcss": {},
  },
};
```

Normal Next.js projects may omit all options. The package root exports
`transformVariantGroups` for testing and advanced integrations. The package publishes
ESM and CommonJS entry points plus type declarations.

## Error handling

Strict mode is enabled by default. An unterminated group, unbalanced nested structure,
or group spanning a template interpolation raises a `VariantGroupSyntaxError` containing
the source filename, line, and column.

With `strict: false`, malformed expressions remain unchanged and valid expressions
continue to expand. Both the loader and PostCSS integration surface errors using the
same core error type and message format.

## Package structure

The intended modules are:

- `src/core`: parser, expansion logic, errors, and source-map-aware transformation.
- `src/loader`: webpack-compatible loader shared by Turbopack and Webpack.
- `src/next`: Next.js configuration wrapper and rule merging.
- `src/postcss`: source discovery, cache, candidate injection, and PostCSS plugin API.
- `tests`: unit, integration, and Next.js fixture coverage.

Implementation will use TypeScript. `@babel/parser` will locate static string ranges,
`magic-string` will produce edits and source maps, and `fast-glob` will discover PostCSS
source files. PostCSS, Next.js, Tailwind CSS, and `@tailwindcss/postcss` will be
declared as compatible peer or development dependencies rather than bundled application
runtimes.

The repository will use pnpm 11.25.0, commit `pnpm-lock.yaml`, declare the package
manager in `package.json`, and use pnpm commands in contributor and consumer
documentation.

## Compatibility

- Tailwind CSS: `>=4.1 <5`
- Next.js: `>=16 <17`
- Node.js: `>=20.9`
- PostCSS: 8.x
- Source formats: JavaScript, JSX, TypeScript, and TSX
- Bundlers: Turbopack and Webpack as integrated by supported Next.js versions
- Module systems: ESM and CommonJS configuration files

## Verification strategy

### Core tests

Table-driven parser tests cover basic, stacked, nested, arbitrary, multiline, malformed,
non-group, strict, non-strict, template-interpolation, and idempotent inputs. Tests also
verify candidate collection, stable ordering, and source locations.

### Integration tests

- Loader tests assert transformed source, unchanged fast paths, errors, and source maps.
- Next wrapper tests assert Turbopack rule merging, Webpack rule insertion, preservation
  of existing callbacks, and use of returned configurations.
- PostCSS tests process a temporary Tailwind stylesheet and source tree with the real
  Tailwind 4.1 PostCSS plugin, then assert that media-query and state CSS is generated
  for expanded candidates.
- A minimal Next.js fixture builds with default Turbopack and again with
  `next build --webpack`; both outputs must include and apply the grouped responsive
  styles.

### Package gates

The completion gate runs formatting or lint checks, TypeScript type checking, unit
tests, integration tests, both Next.js fixture builds, and the distributable package
build. The package contents and exports are inspected after build to ensure loader,
Next.js, PostCSS, ESM, CommonJS, source map, and declaration entry points are present.

## Acceptance criteria

The work is complete when a supported Next.js project can configure the Next wrapper and
PostCSS companion, use nested variant groups in JS or TS components, build successfully
under both Turbopack and Webpack, render expanded class names, and receive the
corresponding Tailwind 4.1 CSS. Malformed syntax must report its originating source
location, ordinary Tailwind classes must continue to work, and existing user bundler
configuration must remain intact.
