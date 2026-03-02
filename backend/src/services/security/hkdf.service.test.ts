import crypto from "crypto";
import { describe, expect, test } from "@jest/globals";

import { hkdf32 } from "./hkdf.service";

describe("hkdf32", () => {
  test("determinism: same inputs produce same output", () => {
    const masterKey = crypto.randomBytes(32);
    const info = "messages";
    const a = hkdf32(masterKey, info);
    const b = hkdf32(masterKey, info);
    expect(a.equals(b)).toBe(true);
  });

  test("output is 32 bytes", () => {
    const masterKey = crypto.randomBytes(32);
    const out = hkdf32(masterKey, "test-info");
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.length).toBe(32);
  });

  test("different info strings produce different output", () => {
    const masterKey = crypto.randomBytes(32);
    const a = hkdf32(masterKey, "messages");
    const b = hkdf32(masterKey, "titles");
    expect(a.equals(b)).toBe(false);
  });

  test("masterKey length validation rejects 16 bytes", () => {
    const shortKey = crypto.randomBytes(16);
    expect(() => hkdf32(shortKey, "info")).toThrow(
      "hkdf32 masterKey must be 32 bytes",
    );
  });

  test("different salt produces different output", () => {
    const masterKey = crypto.randomBytes(32);
    const info = "messages";
    const saltA = crypto.randomBytes(16);
    const saltB = crypto.randomBytes(16);
    const a = hkdf32(masterKey, info, saltA);
    const b = hkdf32(masterKey, info, saltB);
    expect(a.equals(b)).toBe(false);
  });
});
