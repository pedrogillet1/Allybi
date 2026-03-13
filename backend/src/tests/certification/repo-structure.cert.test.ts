import fs from "fs";
import path from "path";

function collectTsFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (!fs.existsSync(current)) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (entry.isFile() && absolutePath.endsWith(".ts")) {
        out.push(absolutePath);
      }
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

describe("Certification: repo structure", () => {
  const root = process.cwd();

  test("legacy wrapper and duplicate authority surfaces stay removed", () => {
    const forbiddenPaths = [
      "src/routes",
      "src/app/http/index.ts",
      "src/app/workers/index.ts",
      "src/platform/db/prismaClient.ts",
      "src/devtools",
      "src/services/core/policy/certification",
      "src/analytics",
      "src/data_banks/__reports",
      "src/data_banks/_deprecated",
      "src/modules/retrieval/application/index.ts",
    ];

    const failures = forbiddenPaths.filter((relativePath) =>
      fs.existsSync(path.resolve(root, relativePath)),
    );

    expect(failures).toEqual([]);
  });

  test("tooling-only packages live outside src", () => {
    const requiredPaths = [
      "tools/document_understanding",
      "tools/policy/certification",
      "tools/analytics",
      "config/nginx/nginx-admin-allybi.conf",
    ];

    const missing = requiredPaths.filter(
      (relativePath) => !fs.existsSync(path.resolve(root, relativePath)),
    );

    expect(missing).toEqual([]);
  });

  test("active source uses chat module homes instead of legacy service implementations", () => {
    const files = collectTsFiles(path.resolve(root, "src")).filter(
      (absolutePath) =>
        !absolutePath.includes(`${path.sep}src${path.sep}services${path.sep}chat${path.sep}`) &&
        !absolutePath.includes(`${path.sep}src${path.sep}tests${path.sep}`),
    );

    const legacyPatterns = [
      "services/chat/conversationKey.service",
      "services/chat/chatCrypto.service",
      "services/chat/encryptedChatRepo.service",
      "services/chat/encryptedChatContext.service",
      "services/chat/chatLanguage.service",
      "services/chat/chatMicrocopy.service",
    ];

    const failures: string[] = [];

    for (const absolutePath of files) {
      const relativePath = path.relative(root, absolutePath);
      const source = fs.readFileSync(absolutePath, "utf8");
      for (const pattern of legacyPatterns) {
        if (source.includes(pattern)) {
          failures.push(`${relativePath}:${pattern}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
