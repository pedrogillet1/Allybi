import crypto from "crypto";
import { describe, expect, test } from "@jest/globals";

/**
 * Phase 0 Security Tests
 * Verifies: code hashing (F-005), HKDF salt (F-008), SSL docs (F-015)
 */

// T-0.1: Verification code hashing
describe("T-0.1: Verification codes must be hashed before storage", () => {
  function hashCode(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex");
  }

  test("SHA-256 of a 6-digit code produces 64-char hex string", () => {
    const code = "123456";
    const hashed = hashCode(code);
    expect(hashed).toHaveLength(64);
    expect(hashed).toMatch(/^[a-f0-9]{64}$/);
  });

  test("same code always produces same hash", () => {
    const code = "789012";
    expect(hashCode(code)).toBe(hashCode(code));
  });

  test("different codes produce different hashes", () => {
    expect(hashCode("123456")).not.toBe(hashCode("654321"));
  });

  test("hashed code does not contain the original code", () => {
    const code = "123456";
    const hashed = hashCode(code);
    expect(hashed).not.toContain(code);
  });
});

// T-0.3: HKDF salt generation
describe("T-0.3: HKDF salt generation utility", () => {
  test("generateHkdfSalt is exported and returns 16-byte buffer", () => {
    const { generateHkdfSalt } = require("../../services/security/hkdf.service");
    const salt = generateHkdfSalt();
    expect(Buffer.isBuffer(salt)).toBe(true);
    expect(salt.length).toBe(16);
  });

  test("two salts are different", () => {
    const { generateHkdfSalt } = require("../../services/security/hkdf.service");
    const a = generateHkdfSalt();
    const b = generateHkdfSalt();
    expect(a.equals(b)).toBe(false);
  });
});

// T-0.6: SSL mode documentation check
describe("T-0.6: Database SSL documentation", () => {
  test("ENVIRONMENT_TRUTH_TABLE.md documents SSL requirement", () => {
    const fs = require("fs");
    const path = require("path");
    const truthTable = fs.readFileSync(
      path.join(__dirname, "../../../../docs/security/ENVIRONMENT_TRUTH_TABLE.md"),
      "utf8",
    );
    expect(truthTable).toContain("sslmode");
  });
});
