import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, expect, test } from "@jest/globals";

import { PolicyValidatorService } from "./policyValidator.service";

describe("PolicyValidatorService", () => {
  test("includes policy-like ui contract banks in certification scope", () => {
    const service = new PolicyValidatorService();
    const files = service.listPolicyFiles();
    const hasUiContracts = files.some((filePath) =>
      filePath.replace(/\\/g, "/").endsWith("/data_banks/overlays/ui_contracts.any.json"),
    );
    const hasUiReceiptShapes = files.some((filePath) =>
      filePath
        .replace(/\\/g, "/")
        .endsWith("/data_banks/patterns/ui/receipt_shapes.any.json"),
    );
    expect(hasUiContracts).toBe(true);
    expect(hasUiReceiptShapes).toBe(true);
  });

  test("flags missing strict meta contract fields", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "policy-validator-"));
    const filePath = path.join(dir, "sample.any.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          _meta: {
            id: "sample_policy",
            version: "1.0.0",
            description: "sample",
            lastUpdated: "2026-03-03",
          },
          config: { enabled: true },
          rules: [{ id: "R1", when: { any: true }, then: { action: "allow" } }],
        },
        null,
        2,
      ),
    );

    const service = new PolicyValidatorService();
    const result = service.validateFile(filePath);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "meta_missing_owner")).toBe(
      true,
    );
    expect(
      result.issues.some((issue) => issue.code === "meta_missing_reviewCadenceDays"),
    ).toBe(true);
    expect(
      result.issues.some((issue) => issue.code === "meta_missing_criticality"),
    ).toBe(true);
  });

  test("detects duplicate policy case prompt tuples", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "policy-validator-"));
    const filePath = path.join(dir, "memory_policy_tests.any.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          _meta: {
            id: "memory_policy_tests",
            version: "1.0.0",
            description: "sample",
            lastUpdated: "2026-03-03",
            owner: "runtime-certification",
            reviewCadenceDays: 30,
            criticality: "low",
          },
          config: { enabled: true },
          cases: [
            {
              id: "A",
              language: "en",
              category: "scope_memory",
              prompt: "use same file",
            },
            {
              id: "B",
              language: "en",
              category: "scope_memory",
              prompt: "use same file",
            },
          ],
        },
        null,
        2,
      ),
    );

    const service = new PolicyValidatorService();
    const result = service.validateFile(filePath);
    expect(
      result.issues.some((issue) => issue.code === "duplicate_prompt_case"),
    ).toBe(true);
  });

  test("requires executable rules for high/critical banks unless configModeOnly", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "policy-validator-"));
    const filePath = path.join(dir, "logging_policy.any.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          _meta: {
            id: "logging_policy",
            version: "1.0.0",
            description: "logging policy",
            lastUpdated: "2026-03-03",
            owner: "platform-observability",
            reviewCadenceDays: 30,
            criticality: "high",
          },
          config: { enabled: true },
          tests: { cases: [{ id: "LOG1" }] },
        },
        null,
        2,
      ),
    );

    const service = new PolicyValidatorService();
    const result = service.validateFile(filePath);
    expect(
      result.issues.some((issue) => issue.code === "critical_policy_missing_rules"),
    ).toBe(true);
  });

  test("executes behavior cases when runtime + expect.action are present", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "policy-validator-"));
    const filePath = path.join(dir, "sample_behavior.any.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          _meta: {
            id: "sample_behavior",
            version: "1.0.0",
            description: "behavior test",
            lastUpdated: "2026-03-03",
            owner: "runtime-certification",
            reviewCadenceDays: 30,
            criticality: "medium",
          },
          config: { enabled: true },
          rules: [
            {
              id: "DENY_A",
              priority: 100,
              when: { path: "signals.block", op: "eq", value: true },
              then: { action: "deny" },
            },
          ],
          tests: {
            cases: [
              {
                id: "CASE_1",
                runtime: { signals: { block: true } },
                expect: { action: "allow" },
              },
            ],
          },
        },
        null,
        2,
      ),
    );

    const service = new PolicyValidatorService();
    const result = service.validateFile(filePath);
    expect(
      result.issues.some((issue) => issue.code === "behavior_case_action_mismatch"),
    ).toBe(true);
  });

  test("validates ui_contract behavior expectations beyond expect.action", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "policy-validator-"));
    const filePath = path.join(dir, "ui_contracts.any.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          _meta: {
            id: "ui_contracts",
            version: "1.0.0",
            description: "ui contracts",
            lastUpdated: "2026-03-03",
            owner: "runtime-certification",
            reviewCadenceDays: 30,
            criticality: "high",
          },
          config: {
            enabled: true,
            contracts: {
              nav_pills: {
                maxIntroSentences: 1,
                allowedOutputShapes: ["button_only"],
              },
            },
          },
          rules: [
            {
              id: "NAV_BLOCK_SOURCES",
              when: {
                all: [{ path: "answerMode", op: "eq", value: "nav_pills" }],
              },
              triggerPatterns: { en: ["\\bSources?:\\b"] },
              action: { type: "hard_block" },
            },
          ],
          tests: {
            cases: [
              {
                id: "UI_CASE_1",
                context: { answerMode: "nav_pills", language: "en" },
                input: "Open the file.",
                expect: { blocked: true },
              },
            ],
          },
        },
        null,
        2,
      ),
    );

    const service = new PolicyValidatorService();
    const result = service.validateFile(filePath);
    expect(
      result.issues.some((issue) => issue.code === "behavior_case_block_mismatch"),
    ).toBe(true);
  });
});
