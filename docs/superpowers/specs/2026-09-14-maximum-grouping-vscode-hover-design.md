# Maximum-Safe Grouping and VS Code Hover Design

## Context

`eslint-plugin-tailwind-variant-groups` currently groups only repeated contiguous
variant prefixes. That keeps the flattened Tailwind order visible, but misses safe
groups when a different recognized candidate appears between candidates with the same
prefix. The runtime transformer already expands nested variant groups, but its public
parser result does not retain source ranges needed by editor tooling.

Tailwind CSS IntelliSense owns ordinary Tailwind hover previews in VS Code. Its class
list parser splits on whitespace, so it cannot recover inherited variants from grouped
syntax. Adding a second grouped-only hover provider is unsafe: a middle token in a group
can also be treated as an unprefixed ordinary utility, producing two conflicting hover
previews. The companion extension therefore replaces Tailwind IntelliSense hover only;
all other Tailwind IntelliSense features remain enabled.

## Goals

- Make maximum-safe grouping the default when Tailwind sorting is enabled.
- Preserve exact variant-chain order and the set of expanded candidates.
- Never move a recognized candidate across an opaque or ambiguous candidate.
- Keep `sort: false` source-order preserving.
- Add an editor-neutral, range-aware class-list parser shared by runtime expansion and
  the editor package.
- Add a VS Code companion extension for JavaScript, JSX, TypeScript, and TSX.
- Show Tailwind-generated CSS for ordinary candidates, grouped candidates with inherited
  variants, and complete group subtrees.
- Keep the runtime and editor paths lazy and cacheable.

## Non-goals

- Completion, diagnostics, color decorators, code actions, or sorting in the VS Code
  extension.
- Editors other than VS Code in this phase.
- HTML, Vue, Svelte, or template languages in this phase.
- Dynamic class expressions or variant groups crossing template interpolations.
- Reordering variant segments, such as changing `hover:md:` into `md:hover:`.
- Publishing to the VS Code Marketplace as part of implementation. A local VSIX is the
  distribution artifact for this phase.
- A command that changes Tailwind IntelliSense or workspace settings.
- Changing the runtime transform or browser behavior of expanded classes.

## Maximum-Safe Grouping

The existing Tailwind analysis remains the safety authority. A candidate is groupable
only when Tailwind parses it, every parse alternative has the same decomposition, and
printing the variant sequence plus utility reconstructs the complete candidate exactly.
All other candidates remain opaque.

With the default `sort: true`, the formatter first applies Tailwind class order. It then
partitions the ordered list into maximal consecutive runs of groupable candidates. Each
opaque candidate is an ordering barrier and is emitted unchanged.

Each groupable run is serialized through an ordered prefix trie:

1. A candidate walks the trie using its existing variant segments in their existing
   order. The utility is stored as a leaf.
2. A child variant gets an output slot at its first occurrence. Later candidates with
   that same prefix join the existing child even when another recognized prefix or an
   unvarianted utility appeared between them.
3. The process repeats recursively, so shared nested prefixes are grouped maximally.
4. A prefix with two or more descendant leaves is emitted as `variant:(...)`. A
   single-descendant prefix stays inline.
5. Utility duplicates are retained. No candidate crosses an opaque barrier.

This changes only class-token order among candidates Tailwind recognized and already
sorted. Tailwind determines generated CSS order independently of DOM class-token order.
Tests must nevertheless prove that expansion retains the same candidate multiset and
that real Tailwind compilation retains equivalent declarations.

When `sort: false`, the formatter keeps the current contiguous serializer. Maximum
grouping would require moving candidates and would violate that option's documented
source-order guarantee.

Example:

```text
hover:(border-purple-500 bg-red-500) md:bg-yellow-500 hover:md:bg-amber-500
```

becomes, under the default settings:

```text
hover:(border-purple-500 bg-red-500 md:bg-amber-500) md:bg-yellow-500
```

The effective `hover:md:` chain is preserved exactly.

## Shared Range-Aware Parser

The root `tailwind-variant-groups` package gains a public class-list parser that returns
an ordered tree of ordinary candidate and variant-group nodes. All ranges are half-open
UTF-16 offsets into the provided text, matching JavaScript and VS Code offsets.

Candidate nodes expose their raw token, effective expanded candidate, and source range.
Group nodes expose their prefix, complete range, prefix range, opening and closing
parenthesis positions, children, and flattened effective candidates. Nested candidates
include every inherited prefix in original order.

Runtime expansion is changed to serialize this tree instead of maintaining an
independent recursive expansion path. Strict delimiter validation and current lenient
behavior remain unchanged. Existing public APIs keep their signatures.

The parser must correctly preserve arbitrary values, arbitrary variants, quotes,
escapes, nested delimiters, nested groups, whitespace, and source offsets. It rejects or
leaves unchanged the same malformed input as the current parser according to strictness.

## VS Code Companion Extension

The monorepo gains `packages/vscode`, packaged as a CommonJS VS Code extension and built
into a local `.vsix`. It activates for JavaScript, JavaScript React, TypeScript, and
TypeScript React documents. The first release supports VS Code `^1.96.0`, Tailwind CSS
`>=4.3 <5`, and workspaces whose extension host provides Node.js 20 or newer.

The extension recognizes static strings in configured JSX attributes and configured
function calls. Defaults match the ESLint package:

- attributes: `class`, `className`
- callees: `cn`, `clsx`, `cva`

The extension registers one hover provider and handles both ordinary and grouped
candidates:

- Hovering an ordinary utility shows Tailwind CSS for that utility.
- Hovering a utility inside a group shows CSS for its fully expanded candidate.
- Hovering a group's prefix or either parenthesis shows all effective candidates in that
  group subtree followed by their combined CSS.
- Hovering a nested group includes inherited outer prefixes but excludes siblings
  outside that nested subtree.
- The smallest candidate node wins over an enclosing group when the pointer is over the
  candidate text.

For example, in:

```text
md:(bg-red-500 hover:(text-white underline))
```

the `text-white` hover compiles `md:hover:text-white`; the `hover:` group hover compiles
`md:hover:text-white` and `md:hover:underline`; and the `md:` group hover compiles all
three effective candidates.

## Tailwind CSS Preview Service

The extension resolves a Tailwind v4 stylesheet from `tailwindVariantGroups.stylesheet`,
relative to the workspace folder. An explicit path is required in this phase; ambiguous
automatic project discovery is out of scope.

The service resolves the workspace's Tailwind installation from the stylesheet, loads
the design system through `@tailwindcss/node`, and uses Tailwind's candidate-to-CSS API
to render previews. This preserves application theme values, custom utilities, plugins,
prefixes, arbitrary values, and variants. Unsupported candidates return no CSS rather
than a guessed preview.

The loaded design system is cached by resolved stylesheet and stylesheet contents. A
file watcher invalidates the cache when the entry stylesheet changes. Imported Tailwind
configuration is reloaded conservatively whenever the entry stylesheet cannot be proven
self-contained, matching the ESLint adapter's safety posture.

Document extraction and class-list trees are cached by document URI and version. Parsing
and Tailwind compilation happen only when VS Code requests hover; the extension does no
work on each keystroke beyond invalidating the document cache naturally through the
version key.

## Configuration and Coexistence

The extension contributes:

```json
{
  "tailwindVariantGroups.hovers": true,
  "tailwindVariantGroups.stylesheet": "./app/globals.css",
  "tailwindVariantGroups.attributes": ["class", "className"],
  "tailwindVariantGroups.callees": ["cn", "clsx", "cva"]
}
```

Projects must disable Tailwind IntelliSense's native hover to prevent incorrect or
duplicate middle-token previews:

```json
{
  "tailwindCSS.hovers": false
}
```

The README explains that Tailwind IntelliSense still owns completions, validation,
colors, and other features. The extension does not mutate workspace settings silently.
If native hover is enabled, it logs one clear coexistence warning per workspace session.

## Error Handling

- Missing or invalid stylesheet configuration produces no hover and logs one actionable
  message to the extension output channel.
- Tailwind loading or compilation failures produce no partial hover and are logged
  without repeatedly notifying on every mouse move.
- Malformed groups produce no grouped hover. ESLint remains the diagnostic owner.
- Unknown candidates are listed in a group expansion but omitted from the CSS block; an
  individual unknown candidate produces no hover.
- Cancellation is checked before stylesheet loading and before returning large group
  previews.

## Verification

Maximum grouping tests cover noncontiguous top-level and nested prefixes, opaque
barriers, exact variant-order preservation, duplicates, `sort: false`, idempotence, and
real Tailwind semantic equivalence.

Parser tests cover ordinary candidates, nested groups, arbitrary syntax, escapes,
multiline input, malformed input, and exact UTF-16 ranges.

Extension tests keep extraction, target selection, Markdown rendering, and Tailwind CSS
generation as independently testable modules. A thin activation test verifies the hover
provider is registered for the four supported language IDs. Package verification builds
and inspects the VSIX, and a fixture smoke test invokes the compiled extension's pure
hover path against a real Tailwind v4 stylesheet.

The repository's full `pnpm verify` remains the final gate, including the existing
Turbopack, webpack, ESLint 9, and ESLint 10 fixtures.
