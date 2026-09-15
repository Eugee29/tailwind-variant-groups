export const Features = {
  DirSelector: 0,
  LightDark: 0,
  LogicalProperties: 0,
  MediaQueries: 0,
  Nesting: 0,
} as const;

export function transform(): never {
  throw new Error(
    "Lightning CSS optimization is not available in the hover extension bundle",
  );
}
