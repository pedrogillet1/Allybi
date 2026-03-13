import fs from "fs";
import path from "path";

describe("Certification: chat production files avoid console.warn", () => {
  test("no chat production file uses console.warn", () => {
    const root = path.resolve(process.cwd(), "src/modules/chat");
    const failures: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const next = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(next);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
        if (entry.name.endsWith(".test.ts")) continue;
        const source = fs.readFileSync(next, "utf8");
        if (source.includes("console.warn(")) {
          failures.push(path.relative(process.cwd(), next));
        }
      }
    };

    walk(root);
    expect(failures).toEqual([]);
  });
});
