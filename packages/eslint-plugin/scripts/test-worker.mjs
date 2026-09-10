import assert from "node:assert/strict";
import fs from "node:fs/promises";
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

const directory = await fs.mkdtemp(
  path.join(packageRoot, "tests/fixtures/worker-cache-"),
);
const stylesheet = path.join(directory, "styles.css");
const theme = path.join(directory, "theme.css");
const request = {
  stylesheet,
  lists: [["w-[8px]"]],
  options: { canonicalize: true, collapse: true, rootFontSize: 16 },
};
try {
  await fs.writeFile(stylesheet, '@import "tailwindcss"; @import "./theme.css";');
  await fs.writeFile(theme, "@theme { --spacing: 0.25rem; }");
  const metadata = await fs.stat(stylesheet);
  assert.equal(analyzeCandidateListsSync(request).lists[0][0].raw, "w-2");
  await fs.writeFile(theme, "@theme { --spacing: 0.5rem; }");
  assert.equal(analyzeCandidateListsSync(request).lists[0][0].raw, "w-1");
  assert.equal((await fs.stat(stylesheet)).mtimeMs, metadata.mtimeMs);
  await fs.unlink(theme);
  assert.throws(() => analyzeCandidateListsSync(request), /theme\.css/);
  // Avoid Tailwind's independent negative resolver cache while proving recovery.
  await fs.writeFile(
    path.join(directory, "replacement.css"),
    "@theme { --spacing: 0.25rem; }",
  );
  await fs.writeFile(stylesheet, '@import "tailwindcss"; @import "./replacement.css";');
  assert.equal(analyzeCandidateListsSync(request).lists[0][0].raw, "w-2");
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
console.log(
  "Persistent worker reloads changed/deleted imports and recovers after replacing a missing import",
);
