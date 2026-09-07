import path from "node:path";
import type { Rule } from "eslint";
import type { FormatOptions } from "./protocol.js";

export const DEFAULT_ATTRIBUTES = ["class", "className"] as const;
export const DEFAULT_CALLEES = ["cn", "clsx", "cva"] as const;

export interface SharedSettings {
  stylesheet?: string;
  attributes?: string[];
  callees?: string[];
  rootFontSize?: number;
}

export interface RuleOptions {
  stylesheet?: string;
  attributes?: string[];
  callees?: string[];
  rootFontSize?: number;
  canonicalize?: boolean;
  collapse?: boolean;
  sort?: boolean;
  group?: boolean;
}

export interface ResolvedSettings extends FormatOptions {
  stylesheet: string | undefined;
  attributes: ReadonlySet<string>;
  callees: ReadonlySet<string>;
}

export function resolveSettings(
  context: Rule.RuleContext,
  ruleOptions: RuleOptions = {},
): ResolvedSettings {
  const shared = (context.settings["tailwind-variant-groups"] ?? {}) as SharedSettings;
  const stylesheet = ruleOptions.stylesheet ?? shared.stylesheet;
  const cwd = context.cwd || process.cwd();

  return {
    stylesheet:
      stylesheet === undefined || stylesheet.length === 0
        ? undefined
        : path.resolve(cwd, stylesheet),
    attributes: new Set(
      ruleOptions.attributes ?? shared.attributes ?? DEFAULT_ATTRIBUTES,
    ),
    callees: new Set(ruleOptions.callees ?? shared.callees ?? DEFAULT_CALLEES),
    rootFontSize: ruleOptions.rootFontSize ?? shared.rootFontSize ?? 16,
    canonicalize: ruleOptions.canonicalize ?? true,
    collapse: ruleOptions.collapse ?? true,
    sort: ruleOptions.sort ?? true,
    group: ruleOptions.group ?? true,
  };
}
