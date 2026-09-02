import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

await Promise.all(
  ["loader.d.cts", "postcss.d.cts"].map((filename) =>
    fs.copyFile(
      path.join(repositoryRoot, "types", filename),
      path.join(repositoryRoot, "dist", filename),
    ),
  ),
);
