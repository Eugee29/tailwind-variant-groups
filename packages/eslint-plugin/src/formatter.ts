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

interface PrefixTrieNode {
  entries: PrefixTrieEntry[];
  variants: Map<string, PrefixTrieVariant>;
  leafCount: number;
}

type PrefixTrieEntry = PrefixTrieUtility | PrefixTrieVariant;

interface PrefixTrieUtility {
  kind: "utility";
  utility: string;
}

interface PrefixTrieVariant {
  kind: "variant";
  variant: string;
  node: PrefixTrieNode;
}

function createPrefixTrieNode(): PrefixTrieNode {
  return { entries: [], variants: new Map(), leafCount: 0 };
}

function buildPrefixTrie(items: readonly AnalyzedCandidate[]): PrefixTrieNode {
  const root = createPrefixTrieNode();

  for (const item of items) {
    let node = root;
    const path = [root];

    for (const variant of item.variants) {
      let entry = node.variants.get(variant);
      if (!entry) {
        entry = { kind: "variant", variant, node: createPrefixTrieNode() };
        node.variants.set(variant, entry);
        node.entries.push(entry);
      }
      node = entry.node;
      path.push(node);
    }

    node.entries.push({ kind: "utility", utility: item.utility });
    for (const pathNode of path) pathNode.leafCount += 1;
  }

  return root;
}

function serializePrefixTrie(node: PrefixTrieNode): string[] {
  return node.entries.map((entry) => {
    if (entry.kind === "utility") return entry.utility;

    const body = serializePrefixTrie(entry.node);
    return entry.node.leafCount >= 2
      ? entry.variant + ":(" + body.join(" ") + ")"
      : entry.variant + ":" + body[0];
  });
}

function serializeMaximumParsedRuns(items: readonly AnalyzedCandidate[]): string[] {
  const output: string[] = [];

  for (let index = 0; index < items.length;) {
    if (!items[index]!.parsed) {
      output.push(items[index]!.raw);
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < items.length && items[end]!.parsed) end += 1;
    output.push(...serializePrefixTrie(buildPrefixTrie(items.slice(index, end))));
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
  return options.sort
    ? serializeMaximumParsedRuns(ordered).join(" ")
    : serializeAtDepth(ordered, 0).join(" ");
}
