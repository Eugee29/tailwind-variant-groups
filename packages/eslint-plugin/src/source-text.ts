export function isSourceSyntax(
  text: string,
  index: number,
  delimiter: string,
): boolean {
  return (
    text[index] === delimiter ||
    (delimiter === "`" && text[index] === "$" && text[index + 1] === "{")
  );
}

export function hasEscapedSourceSyntax(text: string, delimiter: string): boolean {
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\\") {
      escaped = !escaped;
      continue;
    }
    if (escaped && isSourceSyntax(text, index, delimiter)) return true;
    escaped = false;
  }
  return false;
}
