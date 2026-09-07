import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeCandidateListsSync } from "../dist/client.js";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const result = analyzeCandidateListsSync({
  stylesheet: path.join(packageRoot, "tests/fixtures/tailwind.css"),
  lists: [["md:w-[8px]", "md:h-[8px]", "md:mt-2", "md:mb-2"]],
  options: { canonicalize: true, collapse: true, rootFontSize: 16 },
});

assert.deepEqual(
  result.lists[0]?.map((item) => item.raw),
  ["md:size-2", "md:my-2"],
);
