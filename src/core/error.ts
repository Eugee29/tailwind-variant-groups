export interface VariantGroupErrorLocation {
  filename?: string | undefined;
  source: string;
  offset?: number | undefined;
}

export class VariantGroupSyntaxError extends Error {
  readonly filename: string | undefined;
  readonly index: number;
  readonly line: number;
  readonly column: number;

  constructor(message: string, index: number, location: VariantGroupErrorLocation) {
    const sourceIndex = Math.max(0, location.offset ?? 0) + Math.max(0, index);
    const sourceBeforeIndex = location.source.slice(0, sourceIndex);
    const lastNewline = sourceBeforeIndex.lastIndexOf("\n");
    const line = 1 + (sourceBeforeIndex.match(/\n/g)?.length ?? 0);
    const column = sourceBeforeIndex.length - lastNewline;
    const filename = location.filename;

    super(`${filename ?? "<source>"}:${line}:${column}: ${message}`);
    this.name = "VariantGroupSyntaxError";
    this.filename = filename;
    this.index = sourceIndex;
    this.line = line;
    this.column = column;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
