import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const packageName = "tailwind-variant-groups";
const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const consumerRoot = await fs.mkdtemp(path.join(os.tmpdir(), "variant-groups-types-"));

try {
  const nodeModules = path.join(consumerRoot, "node_modules");
  const packageLink = path.join(nodeModules, packageName);
  const consumerFile = path.join(consumerRoot, "index.ts");
  await fs.mkdir(nodeModules);
  await fs.symlink(
    repositoryRoot,
    packageLink,
    process.platform === "win32" ? "junction" : "dir",
  );
  await fs.writeFile(
    consumerFile,
    `import loader from "${packageName}/loader";\nexport type Loader = typeof loader;\n`,
  );

  const compilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  };
  const resolved = ts.resolveModuleName(
    `${packageName}/loader`,
    consumerFile,
    compilerOptions,
    ts.sys,
  ).resolvedModule;

  assert.ok(resolved, "expected the loader subpath to resolve");
  assert.equal(
    resolved.extension,
    ts.Extension.Dcts,
    `expected a CommonJS declaration, resolved ${resolved.resolvedFileName}`,
  );
  await fs.access(resolved.resolvedFileName);

  const program = ts.createProgram([consumerFile], compilerOptions);
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
} finally {
  await fs.rm(consumerRoot, { force: true, recursive: true });
}
