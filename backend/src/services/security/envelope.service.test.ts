import crypto from "crypto";
import { describe, expect, test } from "@jest/globals";

import { EncryptionService } from "./encryption.service";
import { EnvelopeService } from "./envelope.service";

const enc = new EncryptionService();
const svc = new EnvelopeService(enc);

describe("EnvelopeService", () => {
  test("wrap/unwrap roundtrip preserves record key", () => {
    const recordKey = crypto.randomBytes(32);
    const tenantKey = crypto.randomBytes(32);
    const aad = "tenant:abc/conv:xyz";

    const wrapped = svc.wrapRecordKey(recordKey, tenantKey, aad);
    const unwrapped = svc.unwrapRecordKey(wrapped, tenantKey, aad);

    expect(unwrapped.equals(recordKey)).toBe(true);
  });

  test("wrong tenant key fails unwrap", () => {
    const recordKey = crypto.randomBytes(32);
    const tenantKey = crypto.randomBytes(32);
    const wrongKey = crypto.randomBytes(32);
    const aad = "tenant:abc/conv:xyz";

    const wrapped = svc.wrapRecordKey(recordKey, tenantKey, aad);
    expect(() => svc.unwrapRecordKey(wrapped, wrongKey, aad)).toThrow();
  });

  test("AAD mismatch fails unwrap", () => {
    const recordKey = crypto.randomBytes(32);
    const tenantKey = crypto.randomBytes(32);

    const wrapped = svc.wrapRecordKey(recordKey, tenantKey, "a");
    expect(() => svc.unwrapRecordKey(wrapped, tenantKey, "b")).toThrow();
  });
});
