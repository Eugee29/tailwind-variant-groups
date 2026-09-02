# tailwind-variant-groups

UnoCSS-style variant groups for Tailwind CSS 4 and Next.js. Write grouped responsive and
state variants in JavaScript or TypeScript source while the package expands them into
ordinary static Tailwind class names for both the rendered markup and Tailwind's
candidate scanner.

## Install

```bash
pnpm add -D tailwind-variant-groups
```

## Configure Next.js

```ts
// next.config.ts
import { withVariantGroups } from "tailwind-variant-groups/next";

export default withVariantGroups({});
```

Then add the PostCSS companion **before** `@tailwindcss/postcss`. This order is required
because the companion injects expanded candidates for Tailwind to consume.

```js
// postcss.config.mjs
export default {
  plugins: {
    "tailwind-variant-groups/postcss": {},
    "@tailwindcss/postcss": {},
  },
};
```

Keep the usual Tailwind import in your stylesheet:

```css
@import "tailwindcss";
```

## Syntax

Basic responsive group:

```tsx
<div className="md:(flex gap-4)" />
```

This renders as `md:flex md:gap-4`.

Stacked variants:

```tsx
<div className="dark:md:(flex gap-4)" />
```

Nested variants:

```tsx
<button className="md:(flex hover:(bg-blue-500 text-white))" />
```

Arbitrary variants and values:

```tsx
<div className="[&>*]:(p-2 w-[calc(100%-1rem)])" />
```

Groups can span lines inside a static string or template-literal segment:

```tsx
const classes = `
  block
  md:(
    flex
    gap-4
    hover:(bg-blue-500 text-white)
  )
`;
```

## Options

Strict parsing is enabled by default in both integrations. Configure the Next source
transform with the second argument to `withVariantGroups`:

```ts
export default withVariantGroups({}, { strict: false });
```

| Next option | Type      | Default | Description                                                     |
| ----------- | --------- | ------- | --------------------------------------------------------------- |
| `strict`    | `boolean` | `true`  | Throw on malformed groups; `false` leaves malformed text as-is. |

The PostCSS companion supports source discovery options for monorepos and nonstandard
layouts:

```js
// postcss.config.mjs
export default {
  plugins: {
    "tailwind-variant-groups/postcss": {
      base: process.cwd(),
      include: ["apps/web/**/*.{js,jsx,ts,tsx}"],
      exclude: ["**/node_modules/**", "**/.next/**", "**/generated/**"],
      strict: true,
    },
    "@tailwindcss/postcss": {},
  },
};
```

| PostCSS option | Type       | Default                                                                      | Description                                     |
| -------------- | ---------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| `base`         | `string`   | `process.cwd()`                                                              | Directory from which source globs are resolved. |
| `include`      | `string[]` | `["**/*.{js,jsx,ts,tsx}"]`                                                   | Source globs to scan.                           |
| `exclude`      | `string[]` | `node_modules`, `.git`, `.next`, `dist`, `build`, and `coverage` directories | Source globs to ignore.                         |
| `strict`       | `boolean`  | `true`                                                                       | Apply the same malformed-group policy as Next.  |

In strict mode, malformed or unterminated groups and groups crossing a template
interpolation throw a `VariantGroupSyntaxError` with the filename, line, and column.
With `strict: false`, malformed expressions stay unchanged while other valid groups
continue to expand.

## Compatibility

| Component    | Supported versions or modes  |
| ------------ | ---------------------------- |
| Node.js      | `>=20.9`                     |
| Tailwind CSS | `>=4 <5`                     |
| Next.js      | `>=15.3 <17`                 |
| PostCSS      | `^8.4.0`                     |
| Next bundler | Turbopack and Webpack        |
| Source files | `.js`, `.jsx`, `.ts`, `.tsx` |

The Next wrapper merges existing Turbopack rules and preserves an existing Webpack
callback and its returned configuration.

## Limitations

- Tailwind CSS 3 is not supported.
- MDX transformation is not supported.
- Utility-prefix groups such as `font-(bold mono)` are intentionally left unchanged;
  only variant prefixes ending in `:` are grouped.
- Dynamic partial classes cannot be discovered statically. For example,
  `md:(bg-${color})` is unsupported and throws in strict mode. Use complete, statically
  enumerable class names instead.
- Tailwind also scans the original grouped source. It may recognize some raw inner
  utilities and emit a small amount of unused CSS in addition to the correctly expanded
  candidates. This does not change runtime behavior or omit required styles.

## License

MIT
