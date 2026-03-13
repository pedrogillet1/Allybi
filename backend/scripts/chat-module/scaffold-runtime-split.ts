import fs from "fs";
import path from "path";

function main() {
  const name = String(process.argv[2] || "").trim();
  if (!/^[A-Z][A-Za-z0-9]+$/.test(name)) {
    throw new Error("usage: ts-node scaffold-runtime-split.ts <PascalCaseName>");
  }

  const runtimeDir = path.resolve(process.cwd(), "src/modules/chat/runtime");
  const implementationPath = path.join(runtimeDir, `${name}.ts`);
  const testPath = path.join(runtimeDir, `${name}.test.ts`);
  if (fs.existsSync(implementationPath) || fs.existsSync(testPath)) {
    throw new Error(`runtime split target already exists: ${name}`);
  }

  fs.writeFileSync(
    implementationPath,
    `export class ${name} {\n  execute(): void {\n    // Intentionally explicit: fill in the single responsibility for this split.\n  }\n}\n`,
  );
  fs.writeFileSync(
    testPath,
    `import { ${name} } from "./${name}";\n\ndescribe("${name}", () => {\n  test("can be instantiated", () => {\n    expect(new ${name}()).toBeInstanceOf(${name});\n  });\n});\n`,
  );
  process.stdout.write(`created ${name} runtime split scaffold\n`);
}

main();
