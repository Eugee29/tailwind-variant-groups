import { fileURLToPath, pathToFileURL } from "node:url";
import { createSyncFn } from "synckit";
import type { AnalyzeRequest, AnalyzeResponse } from "../protocol.js";

const commonjs = typeof __filename === "string";
const moduleUrl = commonjs ? pathToFileURL(__filename).href : import.meta.url;
const workerPath = fileURLToPath(
  new URL(commonjs ? "./worker.cjs" : "./worker.js", moduleUrl),
);
type RunWorker = (request: AnalyzeRequest) => AnalyzeResponse;

let runWorker: RunWorker | undefined;

function getRunWorker(): RunWorker {
  runWorker ??= createSyncFn(workerPath) as RunWorker;
  return runWorker;
}

export function analyzeCandidateListsSync(request: AnalyzeRequest): AnalyzeResponse {
  return getRunWorker()(request);
}
