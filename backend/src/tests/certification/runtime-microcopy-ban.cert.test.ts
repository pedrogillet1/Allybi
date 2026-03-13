import fs from "fs";
import path from "path";
import { describe, expect, test } from "@jest/globals";

const TARGET_FILES = [
  "src/modules/chat/runtime/ChatRuntimeOrchestrator.ts",
  "src/modules/chat/runtime/ChatTurnExecutor.ts",
  "src/services/core/enforcement/responseContractEnforcer.service.ts",
];

const BANNED_PATTERNS = [
  /Retrieving evidence/i,
  /Composing answer with grounded sources/i,
  /Evidence policy requested clarification/i,
  /I need one clarification/i,
  /I could not find enough evidence/i,
  /Qual parte exata/i,
  /No encontré evidencia suficiente/i,
  /Não encontrei evidência suficiente/i,
  /Ask the user/i,
  /Try listing/i,
  /You should look in/i,
  /I couldn['’]t find/i,
];

describe("Certification: runtime microcopy ban", () => {
  test("runtime and enforcement hotspots do not contain user-facing fallback prose", () => {
    const failures: string[] = [];

    for (const relativePath of TARGET_FILES) {
      const absolutePath = path.resolve(process.cwd(), relativePath);
      const source = fs.readFileSync(absolutePath, "utf8");
      for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(source)) {
          failures.push(`${relativePath}:${pattern}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
