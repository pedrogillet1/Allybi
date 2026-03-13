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
  const root = path.resolve(process.cwd(), "src");
  const rows = walk(root)
    .map((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      const matches = source.match(/\bas any\b/g) || [];
      return {
        filePath: path.relative(process.cwd(), filePath),
        count: matches.length,
      };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.filePath.localeCompare(b.filePath));

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  process.stdout.write(`production_as_any_total=${total}\n`);
  for (const row of rows.slice(0, 200)) {
    process.stdout.write(`${row.count}\t${row.filePath}\n`);
  }
}

main();
