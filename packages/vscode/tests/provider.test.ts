import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createHoverProviderCore } from "../src/provider.js";
import type { HoverRequest } from "../src/provider.js";
import type { TailwindPreviewService } from "../src/tailwind-preview.js";

function request(overrides: Partial<HoverRequest> = {}): HoverRequest {
  const source =
    'export const view = <div data-tw="md:(bg-red-500 hover:(text-white))" />;';
  return {
    uri: "file:///workspace/page.tsx",
    filename: "page.tsx",
    version: 1,
    source,
    documentOffset: source.indexOf("text-white") + 2,
    workspaceFolder: path.resolve("workspace"),
    settings: {
      hovers: true,
      stylesheet: "./app/globals.css",
      attributes: ["data-tw"],
      callees: ["cx"],
    },
    isCancellationRequested: () => false,
    ...overrides,
  };
}

function preview(
  implementation: TailwindPreviewService["candidatesToCss"] = async (
    _stylesheet,
    candidates,
  ) => candidates.map((candidate) => `/* ${candidate} */`),
): TailwindPreviewService {
  return {
    candidatesToCss: vi.fn(implementation),
    invalidate: vi.fn(),
  };
}

describe("createHoverProviderCore", () => {
  it("maps a grouped source offset to inherited candidates, CSS, Markdown, and range", async () => {
    const service = preview();
    const core = createHoverProviderCore(service);
    const input = request();
    const start = input.source.indexOf("text-white");

    await expect(core.provideHover(input)).resolves.toEqual({
      markdown: [
        "`md:hover:text-white`",
        "",
        "```css",
        "/* md:hover:text-white */",
        "```",
      ].join("\n"),
      range: { start, end: start + "text-white".length },
    });
    expect(service.candidatesToCss).toHaveBeenCalledWith(
      path.resolve(input.workspaceFolder!, "app/globals.css"),
      ["md:hover:text-white"],
    );
  });

  it("uses configured direct callees", async () => {
    const source = 'const value = cx("hover:(underline text-white)")';
    const service = preview();
    const core = createHoverProviderCore(service);

    await core.provideHover(
      request({
        source,
        filename: "classes.ts",
        documentOffset: source.indexOf("underline") + 1,
      }),
    );

    expect(service.candidatesToCss).toHaveBeenCalledWith(expect.any(String), [
      "hover:underline",
    ]);
  });

  it.each([
    {
      name: "hovers are disabled",
      overrides: { settings: { ...request().settings, hovers: false } },
    },
    {
      name: "the stylesheet is missing",
      overrides: { settings: { ...request().settings, stylesheet: "" } },
    },
    {
      name: "a relative stylesheet has no workspace",
      overrides: { workspaceFolder: undefined },
    },
    {
      name: "the request is already cancelled",
      overrides: { isCancellationRequested: () => true },
    },
  ])("returns no result when $name", async ({ overrides }) => {
    const service = preview();
    const core = createHoverProviderCore(service);
    await expect(
      core.provideHover(request(overrides as Partial<HoverRequest>)),
    ).resolves.toBeUndefined();
    expect(service.candidatesToCss).not.toHaveBeenCalled();
  });

  it("returns no result for malformed source", async () => {
    const service = preview();
    const core = createHoverProviderCore(service);
    await expect(
      core.provideHover(
        request({
          source: 'const view = <div data-tw="md:(flex)"',
          documentOffset: 34,
        }),
      ),
    ).resolves.toBeUndefined();
    expect(service.candidatesToCss).not.toHaveBeenCalled();
  });

  it("returns no result when an individual candidate is unsupported", async () => {
    const service = preview(async () => [null]);
    const core = createHoverProviderCore(service);
    await expect(core.provideHover(request())).resolves.toBeUndefined();
  });

  it("drops a result when cancellation happens during compilation", async () => {
    let cancelled = false;
    const service = preview(async () => {
      cancelled = true;
      return ["color: white;"];
    });
    const core = createHoverProviderCore(service);

    await expect(
      core.provideHover(request({ isCancellationRequested: () => cancelled })),
    ).resolves.toBeUndefined();
  });
});
