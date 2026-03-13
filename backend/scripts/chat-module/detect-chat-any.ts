import fs from "fs";
import path from "path";

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!fullPath.endsWith(".ts")) continue;
    if (fullPath.endsWith(".test.ts")) continue;
    files.push(fullPath);
  }
  return files;
}

function main() {
  const root = path.resolve(process.cwd(), "src/modules/chat");
  const failures: string[] = [];
  for (const filePath of walk(root)) {
    const source = fs.readFileSync(filePath, "utf8");
    if (/\bas any\b/.test(source)) {
      failures.push(path.relative(process.cwd(), filePath));
    }
  }

  if (failures.length > 0) {
    process.stderr.write(`production as any found:\n${failures.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write("chat module has no production as any\n");
}

main();
