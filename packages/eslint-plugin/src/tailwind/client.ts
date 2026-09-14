import { fileURLToPath, pathToFileURL } from "node:url";
import { createSyncFn } from "synckit";
import type { AnalyzeRequest, AnalyzeResponse } from "../protocol.js";

const commonjs = typeof __filename === "string";
const moduleUrl = commonjs ? pathToFileURL(__filename).href : import.meta.url;
const workerPath = fileURLToPath(
  new URL(commonjs ? "./worker.cjs" : "./worker.js", moduleUrl),
);
const runWorker = createSyncFn(workerPath) as (
  request: AnalyzeRequest,
) => AnalyzeResponse;

export function analyzeCandidateListsSync(request: AnalyzeRequest): AnalyzeResponse {
  return runWorker(request);
}
