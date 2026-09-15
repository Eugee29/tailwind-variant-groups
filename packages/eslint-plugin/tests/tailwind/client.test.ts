import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyzeRequest, AnalyzeResponse } from "../../src/protocol.js";

const { createSyncFn, runWorker } = vi.hoisted(() => ({
  createSyncFn: vi.fn(),
  runWorker: vi.fn<(request: AnalyzeRequest) => AnalyzeResponse>(),
}));

vi.mock("synckit", () => ({ createSyncFn }));

describe("Tailwind worker client", () => {
  beforeEach(() => {
    vi.resetModules();
    createSyncFn.mockReset();
    runWorker.mockReset();
    createSyncFn.mockReturnValue(runWorker);
    runWorker.mockReturnValue({ lists: [] });
  });

  it("does not create a worker until analysis is requested and reuses it", async () => {
    const { analyzeCandidateListsSync } = await import("../../src/tailwind/client.js");
    const request: AnalyzeRequest = {
      stylesheet: "styles.css",
      lists: [[]],
      options: { canonicalize: false, collapse: false, rootFontSize: 16 },
    };

    expect(createSyncFn).not.toHaveBeenCalled();

    expect(analyzeCandidateListsSync(request)).toEqual({ lists: [] });
    expect(analyzeCandidateListsSync(request)).toEqual({ lists: [] });
    expect(createSyncFn).toHaveBeenCalledOnce();
    expect(runWorker).toHaveBeenCalledTimes(2);
  });
});
