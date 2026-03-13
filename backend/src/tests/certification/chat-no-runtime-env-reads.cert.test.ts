import fs from "fs";
import path from "path";

import { CHAT_ENV_ALLOWLIST } from "../../../scripts/chat-module/chatFileCaps.shared";

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

describe("Certification: chat env reads stay centralized", () => {
  test("only config and factory files read process.env", () => {
    const root = path.resolve(process.cwd(), "src/modules/chat");
    const failures = walk(root)
      .map((filePath) => path.relative(process.cwd(), filePath))
      .filter((relativePath) => !CHAT_ENV_ALLOWLIST.has(relativePath))
      .filter((relativePath) =>
        /\bprocess\.env\b/.test(
          fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8"),
        ),
      );

    expect(failures).toEqual([]);
  });
});
