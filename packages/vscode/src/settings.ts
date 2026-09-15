import path from "node:path";
import { DEFAULT_ATTRIBUTES, DEFAULT_CALLEES } from "./class-lists.js";

export interface VariantGroupsHoverSettings {
  hovers: boolean;
  stylesheet: string;
  attributes: readonly string[];
  callees: readonly string[];
}

export const DEFAULT_HOVER_SETTINGS: Readonly<VariantGroupsHoverSettings> = {
  hovers: true,
  stylesheet: "",
  attributes: DEFAULT_ATTRIBUTES,
  callees: DEFAULT_CALLEES,
};

export function resolveStylesheet(
  stylesheet: string,
  workspaceFolder: string | undefined,
): string | undefined {
  const configured = stylesheet.trim();
  if (configured.length === 0) return undefined;
  if (path.isAbsolute(configured)) return path.resolve(configured);
  if (!workspaceFolder) return undefined;
  return path.resolve(workspaceFolder, configured);
}
