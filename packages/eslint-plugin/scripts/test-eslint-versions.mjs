import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import tailwindcss from "eslint-plugin-tailwindcss";
import plugin from "../dist/index.js";

const stylesheet = fileURLToPath(
  new URL("../tests/fixtures/tailwind.css", import.meta.url),
);
for (const [packageName, major] of [
  ["eslint", "9"],
  ["eslint-10", "10"],
]) {
  const { Linter } = await import(packageName);
  assert.equal(Linter.version.split(".")[0], major);
  for (const preset of ["flat/recommended", "flat/compat-tailwindcss"]) {
    const linter = new Linter({ configType: "flat" });
    const config = [
      ...(preset === "flat/compat-tailwindcss"
        ? [tailwindcss.configs.recommended]
        : []),
      plugin.configs[preset],
      {
        languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
        settings: { "tailwind-variant-groups": { stylesheet, callees: ["cn"] } },
      },
    ];
    const source =
      'const View = () => <div className="md:w-[8px] md:h-[8px] md:mt-2 md:mb-2" />;';
    const result = linter.verifyAndFix(source, config);
    assert.deepEqual(result.messages, [], `${packageName} ${preset}`);
    assert.ok(result.output.includes('className="md:(my-2 size-2)"'), result.output);
    const second = linter.verifyAndFix(result.output, config);
    assert.equal(second.fixed, false);
    assert.equal(second.output, result.output);
    assert.deepEqual(second.messages, []);

    // Tailwind may canonicalize content quotes. Both accepted spellings must
    // remain parseable inside a single-quoted JS string after the real fix.
    const quoted = linter.verifyAndFix(
      `const classes = cn('md:content-["hello"] md:p-2');`,
      config,
    );
    assert.deepEqual(quoted.messages, [], quoted.output);
    assert.equal(quoted.fixed, true);
    assert.ok(
      [
        `const classes = cn('md:(p-2 content-["hello"])');`,
        `const classes = cn('md:(p-2 content-[\\'hello\\'])');`,
      ].includes(quoted.output),
      quoted.output,
    );
    const quotedAgain = linter.verifyAndFix(quoted.output, config);
    assert.equal(quotedAgain.fixed, false);
    assert.equal(quotedAgain.output, quoted.output);
    assert.deepEqual(quotedAgain.messages, []);

    const opaque = linter.verifyAndFix(
      'const classes = cn("custom-card md:custom-card md:flex md:grid");',
      config,
    );
    assert.deepEqual(opaque.messages, []);
    assert.ok(opaque.output.includes("custom-card md:custom-card"), opaque.output);

    for (const [text, column] of [
      ["md:(flex))", 14],
      ["md:(flex gap-4)]", 20],
      ["md:(flex gap-4)}", 20],
      ["md:([flex)]", 14],
      ["md:((flex gap-4))", 9],
    ]) {
      const code = `cn("${text}")`;
      const malformed = linter.verifyAndFix(code, config);
      assert.equal(malformed.fixed, false);
      assert.equal(malformed.output, code);
      assert.equal(malformed.messages.length, 1);
      assert.equal(malformed.messages[0].messageId, "invalidGroup");
      assert.equal(malformed.messages[0].column, column);
      assert.equal(malformed.messages[0].endColumn, column + 1);
      assert.equal(malformed.messages[0].fix, undefined);
    }

    const prefixedConfig = [
      ...config,
      {
        settings: {
          "tailwind-variant-groups": {
            stylesheet: fileURLToPath(
              new URL("../tests/fixtures/prefixed.css", import.meta.url),
            ),
          },
        },
      },
    ];
    for (const [input, expected] of [
      ["acme:md:flex", "acme:md:flex"],
      ["acme:md:gap-4 acme:md:flex", "acme:(md:(flex gap-4))"],
      ["acme:(md:(gap-4 flex))", "acme:(md:(flex gap-4))"],
      [
        "acme:md:hover:bg-red-500 acme:md:hover:text-white",
        "acme:(md:(hover:(bg-red-500 text-white)))",
      ],
    ]) {
      const formatted = linter.verifyAndFix(`cn("${input}")`, prefixedConfig);
      assert.deepEqual(formatted.messages, []);
      assert.equal(formatted.output, `cn("${expected}")`);
      const again = linter.verifyAndFix(formatted.output, prefixedConfig);
      assert.equal(again.fixed, false);
      assert.equal(again.output, formatted.output);
      assert.deepEqual(again.messages, []);
    }
    console.log(
      `${packageName} ${Linter.version} ${preset}: canonical, prefix-safe, delimiter-safe, opaque-preserving and idempotent`,
    );
  }
}
