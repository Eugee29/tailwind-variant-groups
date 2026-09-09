# eslint-plugin-tailwind-variant-groups

ESLint validation and formatting for Tailwind CSS variant groups. This is the ESLint
companion package for `tailwind-variant-groups`; install it separately in projects that
want ESLint to own grouped class strings.

The plugin supports ESLint 9 and 10 flat config only, Node.js 20.19 or newer, and
Tailwind CSS 4.3 through 4.x. It analyzes static class strings in `.js`, `.jsx`, `.ts`,
and `.tsx` files. Your application must already have a Tailwind v4 stylesheet entry
point, and `eslint` and `tailwindcss` are peer dependencies.

## Install

Choose your package manager:

```bash
pnpm add -D eslint-plugin-tailwind-variant-groups
npm install --save-dev eslint-plugin-tailwind-variant-groups
yarn add --dev eslint-plugin-tailwind-variant-groups
bun add --dev eslint-plugin-tailwind-variant-groups
```

## Configure ESLint

The recommended preset enables `format-variant-groups` as a warning and
`no-invalid-variant-groups` as an error:

```js
// eslint.config.mjs
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

The stylesheet path is resolved from ESLint's working directory. It must point to the
application's Tailwind entry point, including its `@import "tailwindcss"` and any theme,
source, plugin, or custom-utility declarations that Tailwind should use for analysis.
The formatter reports a configuration error when no stylesheet is configured.

Configure your usual parser and `files` patterns for JavaScript, JSX, TypeScript, and
TSX as needed; the preset does not select a parser.

### With `eslint-plugin-tailwindcss`

Put the compatibility preset after `tailwindcss.configs.recommended` so its overrides
win:

```js
import tailwindcss from "eslint-plugin-tailwindcss";
import variantGroups from "eslint-plugin-tailwind-variant-groups";

export default [
  tailwindcss.configs.recommended,
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

The compatibility preset includes this plugin's recommended rules and disables the nine
`eslint-plugin-tailwindcss` rules that tokenize, canonicalize, or reorder class strings:

- `tailwindcss/classnames-order`
- `tailwindcss/enforces-canonical-classname`
- `tailwindcss/enforces-negative-arbitrary-values`
- `tailwindcss/enforces-shorthand`
- `tailwindcss/important-modifier-suffix`
- `tailwindcss/no-arbitrary-value`
- `tailwindcss/no-custom-classname`
- `tailwindcss/no-contradicting-classname`
- `tailwindcss/no-unnecessary-arbitrary-value`

Other `tailwindcss` rules and unrelated ESLint rules remain enabled. Manually
re-enabling any of these nine fixers over grouped strings is unsupported: a
whitespace-based fixer can move a utility outside its variant scope.

## Formatting behavior

Run ESLint with fixes to canonicalize utilities, collapse related utilities, apply
Tailwind's class order, and recursively group repeated variant prefixes:

```tsx
// Before
<div className="p-4 md:w-[8px] md:h-[8px] md:mt-2 md:mb-2 md:hover:bg-red-500 md:hover:text-white" />

// After eslint --fix
<div className="p-4 md:(my-2 size-2 hover:(bg-red-500 text-white))" />
```

The rule targets static string literals, static template literals, and static strings
nested inside configured callee arguments. The default JSX attributes are `class` and
`className`; the default callees are `cn`, `clsx`, and `cva`. Values inside arrays,
objects, conditional expressions, and logical expressions passed to those callees are
visited recursively.

Template literals containing interpolations are not formatted. The validation rule still
checks their static segments and reports a group that crosses an interpolation.
Malformed groups are reported without a fix. Candidates Tailwind does not recognize are
preserved as opaque values, in stable source order relative to other unknowns.

Formatting is atomic across a file: Tailwind analyzes all eligible lists before ESLint
offers any fixes, so an analysis failure produces one diagnostic and no partial rewrite.
Each successful fix replaces only the inside of its string or attribute and preserves
the surrounding source delimiter.

## Settings and rule options

Shared settings live under `settings["tailwind-variant-groups"]`:

| Setting        | Type       | Default                  | Behavior                                                                                              |
| -------------- | ---------- | ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `stylesheet`   | `string`   | none                     | Tailwind stylesheet entry point, resolved from ESLint's working directory. Required by the formatter. |
| `attributes`   | `string[]` | `["class", "className"]` | JSX attributes to inspect. A custom array replaces the defaults.                                      |
| `callees`      | `string[]` | `["cn", "clsx", "cva"]`  | Calls whose arguments are inspected recursively. A custom array replaces the defaults.                |
| `rootFontSize` | `number`   | `16`                     | Positive root font size Tailwind uses when canonicalizing `rem`-equivalent arbitrary values.          |

`format-variant-groups` accepts the shared settings as rule-level options and adds:

| Option         | Type      | Default | Behavior                                                                                            |
| -------------- | --------- | ------- | --------------------------------------------------------------------------------------------------- |
| `canonicalize` | `boolean` | `true`  | Use Tailwind's canonical spelling for recognized candidates.                                        |
| `collapse`     | `boolean` | `true`  | Let Tailwind combine related utilities, including logical-to-physical canonicalization.             |
| `sort`         | `boolean` | `true`  | Apply Tailwind's class order before grouping.                                                       |
| `group`        | `boolean` | `true`  | Recursively serialize repeated variant prefixes as groups. When `false`, output expanded utilities. |

Rule-level values override shared settings. For example, this preserves post-analysis
candidate order while retaining canonicalization and grouping:

```js
{
  rules: {
    "tailwind-variant-groups/format-variant-groups": ["warn", { sort: false }],
  },
}
```

With `sort: false`, an input that canonicalizes to `md:size-2 md:my-2` is emitted as
`md:(size-2 my-2)`. The default sorted output is `md:(my-2 size-2)`.

`no-invalid-variant-groups` accepts only `attributes` and `callees` as rule-level
options; it does not need a stylesheet.

## Formatter ownership

Plain Prettier is supported and preserves grouped class contents. Disable
`prettier-plugin-tailwindcss` class sorting for every class string owned by this rule;
its whitespace-based sorter does not understand variant-group scope and can undo or
corrupt grouping.

## Compatibility

| Component    | Supported versions or modes  |
| ------------ | ---------------------------- |
| Node.js      | `>=20.19`                    |
| ESLint       | `>=9 <11`, flat config only  |
| Tailwind CSS | `>=4.3 <5`                   |
| Source files | `.js`, `.jsx`, `.ts`, `.tsx` |

## License

MIT
