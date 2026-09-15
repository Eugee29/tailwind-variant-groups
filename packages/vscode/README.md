# Tailwind Variant Groups for VS Code

Tailwind CSS hover previews for ordinary utilities and `variant:(grouped utilities)` in
JavaScript, JSX, TypeScript, and TSX.

The extension understands inherited variants. Given:

```tsx
<div className="md:(bg-red-500 hover:(text-white underline))" />
```

- Hover `text-white` to preview `md:hover:text-white`.
- Hover `hover:`, `(`, or `)` to preview the nested group's two candidates and combined
  CSS.
- Hover `md:`, `(`, or `)` to preview the complete outer group and combined CSS.
- Hover an ordinary utility such as `p-4` to get the usual Tailwind CSS preview.

## Requirements

- VS Code 1.96 or newer
- Node.js 20 or newer in the extension host
- Tailwind CSS `>=4.3 <5` installed in the workspace
- An explicit Tailwind entry stylesheet

## Install the local VSIX

Build the VSIX from the repository:

```bash
pnpm --filter tailwind-variant-groups-vscode package:vsix
```

Then run **Extensions: Install from VSIX...** from the VS Code Command Palette and
select `tailwind-variant-groups-vscode-0.1.0.vsix`.

You can also install it from a terminal:

```bash
code --install-extension tailwind-variant-groups-vscode-0.1.0.vsix
```

## Configure

Add this to the project's `.vscode/settings.json`:

```json
{
  "tailwindCSS.hovers": false,
  "tailwindVariantGroups.hovers": true,
  "tailwindVariantGroups.stylesheet": "./app/globals.css"
}
```

The stylesheet path is relative to the workspace folder. Disabling `tailwindCSS.hovers`
prevents incorrect or duplicate previews on tokens inside a variant group. Tailwind CSS
IntelliSense continues to provide completion, validation, color decorators, and its
other features.

Static strings in `class` and `className` JSX attributes and direct `cn`, `clsx`, and
`cva` calls are supported by default. Replace those lists when your project uses
different names:

```json
{
  "tailwindVariantGroups.attributes": ["class", "className", "data-tw"],
  "tailwindVariantGroups.callees": ["cn", "clsx", "cva", "cx"]
}
```

Dynamic template interpolations are intentionally ignored in this first release.
