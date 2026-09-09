import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  AnalyzedCandidate,
} from "../protocol.js";

interface ParsedCandidate {
  variants: unknown[];
  [key: string]: unknown;
}

interface DesignSystem {
  theme?: { prefix?: string | null };
  canonicalizeCandidates(
    candidates: string[],
    options: {
      rem: number;
      collapse: boolean;
      logicalToPhysical: boolean;
    },
  ): string[];
  getClassOrder(candidates: string[]): [string, bigint | null][];
  parseCandidate(candidate: string): readonly ParsedCandidate[];
  printCandidate(candidate: ParsedCandidate): string;
  printVariant(variant: unknown): string;
}

interface TailwindNodeModule {
  __unstable__loadDesignSystem(
    css: string,
    options: { base: string },
  ): Promise<DesignSystem>;
}

interface CacheEntry {
  signature: string;
  designSystem: DesignSystem;
}

const designSystems = new Map<string, CacheEntry>();
const commonjs = typeof __filename === "string";
const moduleUrl = commonjs ? pathToFileURL(__filename).href : import.meta.url;
const packageRequire = createRequire(moduleUrl);

export function assertSupportedTailwindVersion(
  version: string,
  stylesheet: string,
): void {
  const match = /^(\d+)\.(\d+)(?:\.|$)/.exec(version);
  const major = Number(match?.[1]);
  const minor = Number(match?.[2]);

  if (major !== 4 || minor < 3 || version.includes("-")) {
    throw new Error(
      `Tailwind CSS >=4.3 <5 is required for stylesheet ${path.resolve(stylesheet)}; found ${version}`,
    );
  }
}

export function clearDesignSystemCacheForTests(): void {
  designSystems.clear();
}

async function loadDesignSystem(stylesheet: string): Promise<DesignSystem> {
  const metadata = await fs.stat(stylesheet);
  const signature = `${metadata.mtimeMs}:${metadata.size}`;
  const cached = designSystems.get(stylesheet);

  if (cached?.signature === signature) {
    return cached.designSystem;
  }

  const stylesheetRequire = createRequire(stylesheet);

  try {
    const tailwindNodePath = resolveFromStylesheetOrPackage(
      stylesheetRequire,
      "@tailwindcss/node",
    );
    const tailwindNode = stylesheetRequire(tailwindNodePath) as TailwindNodeModule;
    const tailwindManifestPath = resolveFromStylesheetOrPackage(
      stylesheetRequire,
      "tailwindcss/package.json",
    );
    const version = (stylesheetRequire(tailwindManifestPath) as { version: string })
      .version;

    assertSupportedTailwindVersion(version, stylesheet);
    const css = await fs.readFile(stylesheet, "utf8");
    const designSystem = await tailwindNode.__unstable__loadDesignSystem(css, {
      base: path.dirname(stylesheet),
    });

    if (typeof designSystem.canonicalizeCandidates !== "function") {
      throw new Error(`Tailwind CSS >=4.3 <5 is required for stylesheet ${stylesheet}`);
    }

    designSystems.set(stylesheet, { signature, designSystem });
    return designSystem;
  } catch (error) {
    if (error instanceof Error && error.message.includes(stylesheet)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load Tailwind design system for ${stylesheet}: ${message}`,
      {
        cause: error,
      },
    );
  }
}

function resolveFromStylesheetOrPackage(
  stylesheetRequire: NodeJS.Require,
  specifier: string,
): string {
  try {
    return stylesheetRequire.resolve(specifier);
  } catch (error) {
    if (!isModuleNotFound(error)) {
      throw error;
    }
    return packageRequire.resolve(specifier);
  }
}

function isModuleNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND"
  );
}

function decomposeCandidate(designSystem: DesignSystem, candidate: ParsedCandidate) {
  let utility = designSystem.printCandidate({ ...candidate, variants: [] });
  const variants = [...candidate.variants]
    .reverse()
    .map((variant) => designSystem.printVariant(variant));
  const prefix = designSystem.theme?.prefix;
  if (typeof prefix === "string" && utility.startsWith(prefix + ":")) {
    utility = utility.slice(prefix.length + 1);
    variants.unshift(prefix);
  }
  return { utility, variants };
}

function analyzeList(
  designSystem: DesignSystem,
  request: AnalyzeRequest,
  candidates: string[],
): AnalyzedCandidate[] {
  const canonical = request.options.canonicalize
    ? designSystem.canonicalizeCandidates(candidates, {
        rem: request.options.rootFontSize,
        collapse: request.options.collapse,
        logicalToPhysical: request.options.collapse,
      })
    : candidates;

  return designSystem.getClassOrder(canonical).map(([raw, order], sourceIndex) => {
    const parsedCandidates = designSystem.parseCandidate(raw);
    const orderValue = order === null ? null : order.toString(10);

    if (parsedCandidates.length === 0) {
      return {
        raw,
        utility: raw,
        variants: [],
        order: orderValue,
        parsed: false,
        sourceIndex,
      } satisfies AnalyzedCandidate;
    }

    const candidate = parsedCandidates[0];
    if (!candidate) {
      throw new Error("Tailwind returned an inconsistent parsed candidate result");
    }

    const { utility, variants } = decomposeCandidate(designSystem, candidate);
    // Tailwind's printer can normalize even with canonicalization disabled. Only
    // group a decomposition that reconstructs the complete candidate exactly.
    const reconstructed = [...variants, utility].join(":");
    const agreement = parsedCandidates.slice(1).every((alternative) => {
      const parts = decomposeCandidate(designSystem, alternative);
      return (
        parts.utility === utility &&
        parts.variants.length === variants.length &&
        parts.variants.every((variant, index) => variant === variants[index])
      );
    });
    if (reconstructed !== raw || !agreement) {
      return {
        raw,
        utility: raw,
        variants: [],
        order: orderValue,
        parsed: false,
        sourceIndex,
      } satisfies AnalyzedCandidate;
    }

    return {
      raw,
      utility,
      variants,
      order: orderValue,
      parsed: true,
      sourceIndex,
    } satisfies AnalyzedCandidate;
  });
}

export async function analyzeCandidateLists(
  request: AnalyzeRequest,
): Promise<AnalyzeResponse> {
  const stylesheet = path.resolve(request.stylesheet);
  const designSystem = await loadDesignSystem(stylesheet);

  return {
    lists: request.lists.map((candidates) =>
      analyzeList(designSystem, request, candidates),
    ),
  };
}
