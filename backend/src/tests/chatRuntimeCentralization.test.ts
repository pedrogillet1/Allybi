import { describe, expect, test } from "@jest/globals";
import fs from "fs";
import path from "path";

function read(relPath: string): string {
  const full = path.resolve(process.cwd(), relPath);
  return fs.readFileSync(full, "utf8");
}

describe("chat runtime centralization guard", () => {
  test("active chat runtime does not import legacy runtime service", () => {
    const src = read("src/modules/chat/application/chat-runtime.service.ts");
    expect(src).not.toMatch(/chatRuntime\.legacy\.service/);
    expect(src).not.toMatch(/LegacyChatRuntimeService/);
  });

  test("legacy runtime module re-export file is removed", () => {
    const full = path.resolve(
      process.cwd(),
      "src/modules/chat/runtime/legacy/chat-runtime.legacy.service.ts",
    );
    expect(fs.existsSync(full)).toBe(false);
  });

  test("source buttons policy loads source_engine from bank loader", () => {
    const src = read("src/services/core/retrieval/sourceButtons.service.ts");
    expect(src).toMatch(/getOptionalBank<SourceEngineDataBank>\("source_engine"\)/);
    expect(src).not.toMatch(/readFileSync/);
    expect(src).not.toMatch(/data_banks\/retrieval\/source_engine\.any\.json/);
  });
});

