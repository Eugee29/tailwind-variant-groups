import { runAsWorker } from "synckit";
import { analyzeCandidateLists } from "./analyze.js";
import type { AnalyzeRequest } from "../protocol.js";

runAsWorker((request: AnalyzeRequest) => analyzeCandidateLists(request));
