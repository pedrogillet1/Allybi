import fs from "fs";
import path from "path";

function collectTsFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (!fs.existsSync(current)) continue;

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      if (entry.isFile() && absolute.endsWith(".ts")) {
        out.push(absolute);
      }
    }
  }

  return out.sort((a, b) => a.localeCompare(b));
}

describe("Certification: tools boundary", () => {
  test("tool packages do not import src directly outside tools/shared", () => {
    const root = path.resolve(process.cwd(), "tools");
    const files = collectTsFiles(root).filter(
      (absolutePath) =>
        !absolutePath.includes(`${path.sep}tools${path.sep}shared${path.sep}`),
    );

    const failures: string[] = [];

    for (const absolutePath of files) {
      const relativePath = path.relative(process.cwd(), absolutePath);
      const source = fs.readFileSync(absolutePath, "utf8");
      if (/from\s+["'][^"']*src\//.test(source)) {
        failures.push(relativePath);
      }
    }

    expect(failures).toEqual([]);
  });
});
