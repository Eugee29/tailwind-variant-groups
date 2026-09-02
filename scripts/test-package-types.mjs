import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const packageName = "tailwind-variant-groups";
const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const consumerRoot = await fs.mkdtemp(path.join(os.tmpdir(), "variant-groups-types-"));
const declarationPaths = [
  "dist/loader.d.cts",
  "dist/postcss.d.cts",
  "dist/postcss.d.ts",
];

function assertPackedDeclarations() {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(pnpm, ["pack", "--dry-run", "--json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stderr);

  const packedPaths = new Set(JSON.parse(result.stdout).files.map((file) => file.path));
  for (const declarationPath of declarationPaths) {
    assert.ok(
      packedPaths.has(declarationPath),
      `expected ${declarationPath} in the dry-run package`,
    );
  }
}

try {
  const nodeModules = path.join(consumerRoot, "node_modules");
  const packageLink = path.join(nodeModules, packageName);
  const commonjsConsumerFile = path.join(consumerRoot, "index.cts");
  const esmConsumerFile = path.join(consumerRoot, "index.mts");
  await fs.mkdir(nodeModules);
  await fs.symlink(
    repositoryRoot,
    packageLink,
    process.platform === "win32" ? "junction" : "dir",
  );
  await fs.writeFile(
    commonjsConsumerFile,
    `import loader = require("${packageName}/loader");
import variantGroups = require("${packageName}/postcss");

loader.call(
  {
    resourcePath: "/app/page.tsx",
    callback(error, code, map) {
      void error;
      void code;
      void map;
    },
  },
  'const classes = "flex"',
);
variantGroups({ strict: true });
`,
  );
  await fs.writeFile(
    esmConsumerFile,
    `import variantGroups from "${packageName}/postcss";

variantGroups({ strict: true });
`,
  );

  const compilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  };
  async function assertDeclaration(
    specifier,
    consumerFile,
    expectedExtension,
    resolutionMode,
  ) {
    const resolved = ts.resolveModuleName(
      specifier,
      consumerFile,
      compilerOptions,
      ts.sys,
      undefined,
      undefined,
      resolutionMode,
    ).resolvedModule;

    assert.ok(resolved, `expected ${specifier} to resolve from ${consumerFile}`);
    assert.equal(
      resolved.extension,
      expectedExtension,
      `resolved ${resolved.resolvedFileName}`,
    );
    await fs.access(resolved.resolvedFileName);
  }

  await assertDeclaration(
    `${packageName}/loader`,
    commonjsConsumerFile,
    ts.Extension.Dcts,
    ts.ModuleKind.CommonJS,
  );
  await assertDeclaration(
    `${packageName}/postcss`,
    commonjsConsumerFile,
    ts.Extension.Dcts,
    ts.ModuleKind.CommonJS,
  );
  await assertDeclaration(
    `${packageName}/postcss`,
    esmConsumerFile,
    ts.Extension.Dts,
    ts.ModuleKind.ESNext,
  );

  assertPackedDeclarations();

  const program = ts.createProgram(
    [commonjsConsumerFile, esmConsumerFile],
    compilerOptions,
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (filename) => filename,
      getCurrentDirectory: () => consumerRoot,
      getNewLine: () => "\n",
    }),
  );

  const consumerRequire = createRequire(commonjsConsumerFile);
  const loader = consumerRequire(`${packageName}/loader`);
  assert.equal(typeof loader, "function", "loader require must be callable");
  assert.equal(loader.default, undefined, "loader require must not need .default");

  const source = 'const classes = "flex"';
  const inputMap = { version: 3 };
  let callbackArguments;
  loader.call(
    {
      resourcePath: "/app/page.tsx",
      callback(...args) {
        callbackArguments = args;
      },
    },
    source,
    inputMap,
  );
  assert.deepEqual(callbackArguments, [null, source, inputMap]);

  const variantGroups = consumerRequire(`${packageName}/postcss`);
  assert.equal(typeof variantGroups, "function", "PostCSS require must be callable");
  assert.equal(
    variantGroups.default,
    undefined,
    "PostCSS require must not need .default",
  );
  assert.equal(variantGroups.postcss, true);
  assert.equal(variantGroups().postcssPlugin, "tailwind-variant-groups");
} finally {
  await fs.rm(consumerRoot, { force: true, recursive: true });
}
