import type { AnalyzedCandidate } from "./protocol.js";

export interface SerializeOptions {
  sort: boolean;
  group: boolean;
}

export function sortAnalyzedCandidates(
  items: readonly AnalyzedCandidate[],
): AnalyzedCandidate[] {
  return items
    .map((item, index) => ({ index, item }))
    .sort((left, right) => {
      const leftOrder = left.item.order;
      const rightOrder = right.item.order;

      if (leftOrder === null) {
        return rightOrder === null ? left.index - right.index : -1;
      }
      if (rightOrder === null) return 1;

      const orderDifference = BigInt(leftOrder) - BigInt(rightOrder);
      if (orderDifference < 0n) return -1;
      if (orderDifference > 0n) return 1;
      return left.index - right.index;
    })
    .map(({ item }) => item);
}

function serializeAtDepth(
  items: readonly AnalyzedCandidate[],
  depth: number,
): string[] {
  const output: string[] = [];

  for (let index = 0; index < items.length;) {
    const item = items[index]!;
    const variant = item.parsed ? item.variants[depth] : undefined;

    if (variant === undefined) {
      output.push(depth === 0 ? item.raw : item.utility);
      index += 1;
      continue;
    }

    let end = index + 1;
    while (
      end < items.length &&
      items[end]!.parsed &&
      items[end]!.variants[depth] === variant
    ) {
      end += 1;
    }

    if (end - index >= 2) {
      const body = serializeAtDepth(items.slice(index, end), depth + 1);
      output.push(variant + ":(" + body.join(" ") + ")");
    } else {
      const suffix = item.variants
        .slice(depth)
        .map((part) => part + ":")
        .join("");
      output.push(suffix + item.utility);
    }
    index = end;
  }

  return output;
}

export function serializeVariantGroups(
  items: readonly AnalyzedCandidate[],
  options: SerializeOptions,
): string {
  const ordered = options.sort ? sortAnalyzedCandidates(items) : [...items];
  if (!options.group) return ordered.map((item) => item.raw).join(" ");
  return serializeAtDepth(ordered, 0).join(" ");
}
