import { extractStaticClassLists, type ExtractedClassList } from "./class-lists.js";
import { renderHoverMarkdown } from "./hover-markdown.js";
import { findHoverTarget } from "./hover-target.js";
import { resolveStylesheet, type VariantGroupsHoverSettings } from "./settings.js";
import type { TailwindPreviewService } from "./tailwind-preview.js";
import type { TextRange } from "tailwind-variant-groups";

export { createTailwindPreviewService } from "./tailwind-preview.js";

export interface HoverRequest {
  uri: string;
  filename: string;
  version: number;
  source: string;
  documentOffset: number;
  workspaceFolder: string | undefined;
  settings: VariantGroupsHoverSettings;
  isCancellationRequested(): boolean;
}

export interface ProviderHover {
  markdown: string;
  range: TextRange;
}

export interface HoverProviderCore {
  provideHover(request: HoverRequest): Promise<ProviderHover | undefined>;
  clearDocumentCache(uri?: string): void;
}

interface CachedClassLists {
  version: number;
  source: string;
  filename: string;
  attributes: string;
  callees: string;
  lists: ExtractedClassList[];
}

function configurationKey(values: readonly string[]): string {
  return JSON.stringify(values);
}

export function createHoverProviderCore(
  preview: TailwindPreviewService,
): HoverProviderCore {
  const documents = new Map<string, CachedClassLists>();

  function classLists(request: HoverRequest): ExtractedClassList[] | undefined {
    const attributes = configurationKey(request.settings.attributes);
    const callees = configurationKey(request.settings.callees);
    const cached = documents.get(request.uri);
    if (
      cached?.version === request.version &&
      cached.source === request.source &&
      cached.filename === request.filename &&
      cached.attributes === attributes &&
      cached.callees === callees
    ) {
      return cached.lists;
    }

    try {
      const lists = extractStaticClassLists(request.source, request.filename, {
        attributes: new Set(request.settings.attributes),
        callees: new Set(request.settings.callees),
      });
      documents.set(request.uri, {
        version: request.version,
        source: request.source,
        filename: request.filename,
        attributes,
        callees,
        lists,
      });
      return lists;
    } catch {
      documents.delete(request.uri);
      return undefined;
    }
  }

  return {
    async provideHover(request) {
      if (!request.settings.hovers || request.isCancellationRequested()) {
        return undefined;
      }
      const stylesheet = resolveStylesheet(
        request.settings.stylesheet,
        request.workspaceFolder,
      );
      if (!stylesheet) return undefined;

      const lists = classLists(request);
      if (!lists || request.isCancellationRequested()) return undefined;
      const target = findHoverTarget(lists, request.documentOffset);
      if (!target) return undefined;

      const css = await preview.candidatesToCss(stylesheet, target.candidates);
      if (request.isCancellationRequested()) return undefined;
      const markdown = renderHoverMarkdown(target, css);
      return markdown ? { markdown, range: target.range } : undefined;
    },
    clearDocumentCache(uri) {
      if (uri === undefined) documents.clear();
      else documents.delete(uri);
    },
  };
}
