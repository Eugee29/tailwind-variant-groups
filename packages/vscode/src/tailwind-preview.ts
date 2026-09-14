import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { __unstable__loadDesignSystem as bundledLoadDesignSystem } from "@tailwindcss/node";

interface DesignSystem {
  candidatesToCss(candidates: string[]): (string | null)[];
}

interface TailwindNodeModule {
  __unstable__loadDesignSystem(
    css: string,
    options: { base: string },
  ): Promise<DesignSystem>;
}

interface CacheEntry {
  css: string;
  designSystem: DesignSystem;
}

export interface TailwindPreviewService {
  candidatesToCss(
    stylesheet: string,
    candidates: readonly string[],
  ): Promise<(string | null)[]>;
  invalidate(stylesheet?: string): void;
}

function isModuleNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND"
  );
}

function loadTailwindNode(stylesheetRequire: NodeJS.Require): TailwindNodeModule {
  try {
    const resolved = stylesheetRequire.resolve("@tailwindcss/node");
    return stylesheetRequire(resolved) as TailwindNodeModule;
  } catch (error) {
    if (!isModuleNotFound(error)) throw error;
    return {
      __unstable__loadDesignSystem: bundledLoadDesignSystem as (
        css: string,
        options: { base: string },
      ) => Promise<DesignSystem>,
    };
  }
}

function isCacheable(css: string): boolean {
  return [...css.matchAll(/@(?:import|reference|config|plugin)\b/gi)].every(
    (directive) =>
      /^@import\s+(["'])tailwindcss\1(?=\s|;)/u.test(css.slice(directive.index)),
  );
}

export function assertSupportedTailwindVersion(
  version: string,
  stylesheet: string,
): void {
  const match = /^(\d+)\.(\d+)(?:\.|$)/u.exec(version);
  const major = Number(match?.[1]);
  const minor = Number(match?.[2]);

  if (major !== 4 || minor < 3 || version.includes("-")) {
    throw new Error(
      `Tailwind CSS >=4.3 <5 is required for stylesheet ${path.resolve(stylesheet)}; found ${version}`,
    );
  }
}

export function createTailwindPreviewService(): TailwindPreviewService {
  const designSystems = new Map<string, CacheEntry>();

  async function loadDesignSystem(stylesheet: string): Promise<DesignSystem> {
    const resolved = path.resolve(stylesheet);
    const css = await fs.readFile(resolved, "utf8");
    const cacheable = isCacheable(css);
    const cached = designSystems.get(resolved);
    if (cacheable && cached?.css === css) return cached.designSystem;
    designSystems.delete(resolved);

    const stylesheetRequire = createRequire(resolved);
    try {
      const tailwindNode = loadTailwindNode(stylesheetRequire);
      const manifestPath = stylesheetRequire.resolve("tailwindcss/package.json");
      const manifest = stylesheetRequire(manifestPath) as { version: string };

      assertSupportedTailwindVersion(manifest.version, resolved);
      const designSystem = await tailwindNode.__unstable__loadDesignSystem(css, {
        base: path.dirname(resolved),
      });
      if (typeof designSystem.candidatesToCss !== "function") {
        throw new Error(`Tailwind CSS >=4.3 <5 is required for stylesheet ${resolved}`);
      }

      if (cacheable) designSystems.set(resolved, { css, designSystem });
      return designSystem;
    } catch (error) {
      if (error instanceof Error && error.message.includes(resolved)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to load Tailwind design system for ${resolved}: ${message}`,
        { cause: error },
      );
    }
  }

  return {
    async candidatesToCss(stylesheet, candidates) {
      const designSystem = await loadDesignSystem(stylesheet);
      return designSystem.candidatesToCss([...candidates]);
    },
    invalidate(stylesheet) {
      if (stylesheet === undefined) {
        designSystems.clear();
      } else {
        designSystems.delete(path.resolve(stylesheet));
      }
    },
  };
}
