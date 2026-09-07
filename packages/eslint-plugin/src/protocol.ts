export interface AnalyzedCandidate {
  raw: string;
  utility: string;
  variants: string[];
  order: string | null;
  parsed: boolean;
  sourceIndex: number;
}

export interface FormatOptions {
  canonicalize: boolean;
  collapse: boolean;
  sort: boolean;
  group: boolean;
  rootFontSize: number;
}

export interface AnalyzeRequest {
  stylesheet: string;
  lists: string[][];
  options: Pick<FormatOptions, "canonicalize" | "collapse" | "rootFontSize">;
}

export interface AnalyzeResponse {
  lists: AnalyzedCandidate[][];
}
