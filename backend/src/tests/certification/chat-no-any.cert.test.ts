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

describe("Certification: chat module has no production as any", () => {
  test("chat production sources avoid as any", () => {
    const root = path.resolve(process.cwd(), "src/modules/chat");
    const failures = walk(root)
      .filter((filePath) =>
        /\bas any\b/.test(fs.readFileSync(filePath, "utf8")),
      )
      .map((filePath) => path.relative(process.cwd(), filePath));

    expect(failures).toEqual([]);
  });
});
