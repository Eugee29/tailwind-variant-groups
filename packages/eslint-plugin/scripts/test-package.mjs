import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const packageName = "eslint-plugin-tailwind-variant-groups";
const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const consumerRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), "variant-groups-eslint-package-"),
);
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32" && command === pnpm,
  });
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

async function link(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.symlink(
    source,
    destination,
    process.platform === "win32" ? "junction" : "dir",
  );
}

function assertPublicPlugin(module) {
  const plugin = module.default ?? module;
  assert.deepEqual(Object.keys(plugin.rules).sort(), [
    "format-variant-groups",
    "no-invalid-variant-groups",
  ]);
  assert.deepEqual(Object.keys(plugin.configs).sort(), [
    "flat/compat-tailwindcss",
    "flat/recommended",
  ]);
  return plugin;
}

try {
  const dryRun = JSON.parse(run(pnpm, ["pack", "--dry-run", "--json"], packageRoot));
  const packedPaths = new Set(dryRun.files.map(({ path }) => path));
  for (const artifact of [
    "dist/index.js",
    "dist/index.cjs",
    "dist/index.d.ts",
    "dist/worker.js",
    "dist/worker.cjs",
  ]) {
    assert.ok(packedPaths.has(artifact), `missing packed ${artifact}`);
  }
  for (const filename of packedPaths) {
    assert.doesNotMatch(filename, /(^|\/)(src|tests|fixtures|\.next|out)(\/|$)/);
  }
  assertPublicPlugin(await import(new URL("../dist/index.js", import.meta.url)));
  assertPublicPlugin(createRequire(import.meta.url)("../dist/index.cjs"));

  // Execute the actual archived files outside the repository. Only dependencies
  // are linked from the installed graph, never the plugin source or built folder.
  run(pnpm, ["pack", "--pack-destination", consumerRoot, "--json"], packageRoot);
  const tarballs = (await fs.readdir(consumerRoot)).filter((file) =>
    file.endsWith(".tgz"),
  );
  assert.equal(tarballs.length, 1);
  const tarball = path.join(consumerRoot, tarballs[0]);
  const archiveFiles = run("tar", ["-tf", tarball], consumerRoot).trim().split(/\r?\n/);
  assert.deepEqual(
    new Set(archiveFiles.map((file) => file.replace(/^package\//, ""))),
    packedPaths,
  );
  run("tar", ["-xf", tarball, "-C", consumerRoot], consumerRoot);
  const extractedRoot = path.join(consumerRoot, "package");
  const nodeModules = path.join(consumerRoot, "node_modules");
  await link(extractedRoot, path.join(nodeModules, packageName));
  for (const dependency of [
    "@tailwindcss/node",
    "synckit",
    "tailwind-variant-groups",
    "tailwindcss",
    "eslint",
    "@types/eslint",
  ]) {
    await link(
      await fs.realpath(path.join(packageRoot, "node_modules", dependency)),
      path.join(nodeModules, dependency),
    );
  }
  const stylesheet = path.join(consumerRoot, "tailwind.css");
  await fs.writeFile(stylesheet, '@import "tailwindcss";');
  const consumerRequire = createRequire(path.join(consumerRoot, "index.cjs"));
  assert.equal(
    await fs.realpath(consumerRequire.resolve(packageName)),
    path.join(extractedRoot, "dist/index.cjs"),
  );
  const { Linter } = consumerRequire("eslint");
  const esmConsumer = path.join(consumerRoot, "runtime.mjs");
  await fs.writeFile(
    esmConsumer,
    `import assert from "node:assert/strict";\nimport plugin from "${packageName}";\nassert.equal(plugin.meta.name, "${packageName}");\nconsole.log(import.meta.resolve("${packageName}"));\n`,
  );
  assert.equal(
    run(process.execPath, [esmConsumer], consumerRoot).trim(),
    pathToFileURL(path.join(extractedRoot, "dist/index.js")).href,
    "ESM package specifier must select the archived import entry",
  );
  for (const [mode, module] of [
    [
      "ESM",
      await import(
        pathToFileURL(path.join(nodeModules, packageName, "dist/index.js")).href
      ),
    ],
    ["CJS", consumerRequire(packageName)],
  ]) {
    const plugin = assertPublicPlugin(module);
    const linter = new Linter({ configType: "flat" });
    const config = [
      plugin.configs["flat/recommended"],
      { settings: { "tailwind-variant-groups": { stylesheet, callees: ["cn"] } } },
    ];
    const result = linter.verifyAndFix(
      'const classes = cn("md:w-[8px] md:h-[8px] md:mt-2 md:mb-2");',
      config,
    );
    assert.deepEqual(result.messages, [], `${mode} packed worker`);
    assert.equal(result.output, 'const classes = cn("md:(my-2 size-2)");');
    const again = linter.verifyAndFix(result.output, config);
    assert.equal(again.fixed, false);
    assert.deepEqual(again.messages, []);
    console.log(`${mode}: packed public API and adjacent worker execute successfully`);
  }

  const compilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  };
  const consumers = [];
  for (const [extension, resolutionMode] of [
    ["mts", ts.ModuleKind.ESNext],
    ["cts", ts.ModuleKind.CommonJS],
  ]) {
    const filename = path.join(consumerRoot, `index.${extension}`);
    consumers.push(filename);
    await fs.writeFile(
      filename,
      `import plugin from "${packageName}";\nconst recommended = plugin.configs["flat/recommended"];\nconst compat = plugin.configs["flat/compat-tailwindcss"];\nconst format = plugin.rules["format-variant-groups"];\nconst validate = plugin.rules["no-invalid-variant-groups"];\nvoid [recommended, compat, format, validate];\n`,
    );
    const resolved = ts.resolveModuleName(
      packageName,
      filename,
      compilerOptions,
      ts.sys,
      undefined,
      undefined,
      resolutionMode,
    ).resolvedModule;
    assert.ok(resolved, `${extension}: package types must resolve`);
    assert.equal(
      await fs.realpath(resolved.resolvedFileName),
      path.join(extractedRoot, "dist/index.d.ts"),
    );
  }
  const diagnostics = ts.getPreEmitDiagnostics(
    ts.createProgram(consumers, compilerOptions),
  );
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (filename) => filename,
      getCurrentDirectory: () => consumerRoot,
      getNewLine: () => "\n",
    }),
  );
  console.log("Packed .mts/.cts consumers: zero TypeScript diagnostics");
} finally {
  // consumerRoot is the exact directory returned by mkdtemp above.
  await fs.rm(consumerRoot, { recursive: true, force: true });
}
