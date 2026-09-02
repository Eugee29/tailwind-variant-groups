import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fg from "fast-glob";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureRoot = path.join(repositoryRoot, "tests/fixtures/next-app");
const nextBin = path.join(repositoryRoot, "node_modules/next/dist/bin/next");

async function assertBuildArtifacts(mode) {
  const cssFiles = await fg(".next/**/*.css", {
    cwd: fixtureRoot,
    absolute: true,
  });
  assert.ok(cssFiles.length > 0, `${mode}: expected emitted CSS`);
  const css = (
    await Promise.all(cssFiles.map((file) => fs.readFile(file, "utf8")))
  ).join("\n");
  assert.match(css, /\.md\\:flex/);
  assert.match(css, /\.md\\:gap-4/);
  assert.match(css, /\.md\\:hover\\:bg-blue-500/);
  assert.match(css, /\.md\\:hover\\:text-white/);

  const serverFiles = await fg(".next/server/**/*.{html,rsc,txt,js}", {
    cwd: fixtureRoot,
    absolute: true,
  });
  const serverOutput = (
    await Promise.all(serverFiles.map((file) => fs.readFile(file, "utf8")))
  ).join("\n");
  assert.match(serverOutput, /md:flex/);
  assert.match(serverOutput, /md:gap-4/);
  assert.match(serverOutput, /md:hover:bg-blue-500/);
  assert.match(serverOutput, /md:hover:text-white/);
  assert.doesNotMatch(serverOutput, /md:\(flex/);
  assert.doesNotMatch(serverOutput, /hover:\(bg-blue-500/);
}

async function runBuild(mode, webpack) {
  await fs.rm(path.join(fixtureRoot, ".next"), {
    recursive: true,
    force: true,
  });
  await fs.rm(path.join(fixtureRoot, "out"), {
    recursive: true,
    force: true,
  });

  const child = spawnSync(
    process.execPath,
    [nextBin, "build", ...(webpack ? ["--webpack"] : [])],
    {
      cwd: fixtureRoot,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "inherit",
    },
  );
  assert.equal(child.status, 0, `${mode}: Next build failed`);
  await assertBuildArtifacts(mode);
}

await runBuild("turbopack", false);
await runBuild("webpack", true);
