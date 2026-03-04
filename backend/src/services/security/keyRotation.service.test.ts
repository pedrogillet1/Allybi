import { describe, expect, test } from "@jest/globals";
import { EncryptionService } from "./encryption.service";
import { EnvelopeService } from "./envelope.service";
import { KeyRotationService } from "./keyRotation.service";

describe("KeyRotationService", () => {
  const enc = new EncryptionService();
  const envelope = new EnvelopeService(enc);
  const service = new KeyRotationService(enc, envelope);

  test("rewrapDocumentKey re-wraps with new tenant key", () => {
    const oldTk = enc.randomKey32();
    const newTk = enc.randomKey32();
    const dk = enc.randomKey32();

    const wrappedWithOld = envelope.wrapRecordKey(dk, oldTk, "wrap:document:doc-1");

    const wrappedWithNew = service.rewrapDocumentKey(
      wrappedWithOld,
      oldTk,
      newTk,
      "wrap:document:doc-1",
    );

    // Verify: unwrapping with new TK produces the same DK
    const recovered = envelope.unwrapRecordKey(wrappedWithNew, newTk, "wrap:document:doc-1");
    expect(recovered.equals(dk)).toBe(true);
  });

  test("old tenant key cannot unwrap the re-wrapped key", () => {
    const oldTk = enc.randomKey32();
    const newTk = enc.randomKey32();
    const dk = enc.randomKey32();

    const wrappedWithOld = envelope.wrapRecordKey(dk, oldTk, "wrap:document:doc-1");
    const wrappedWithNew = service.rewrapDocumentKey(
      wrappedWithOld,
      oldTk,
      newTk,
      "wrap:document:doc-1",
    );

    expect(() =>
      envelope.unwrapRecordKey(wrappedWithNew, oldTk, "wrap:document:doc-1"),
    ).toThrow();
  });

  test("rewrapBatch handles mixed success/failure", () => {
    const oldTk = enc.randomKey32();
    const newTk = enc.randomKey32();

    const dk1 = enc.randomKey32();
    const wrapped1 = envelope.wrapRecordKey(dk1, oldTk, "wrap:document:doc-1");

    const results = service.rewrapBatch(
      [
        { documentId: "doc-1", wrappedKey: wrapped1, aad: "wrap:document:doc-1" },
        { documentId: "doc-2", wrappedKey: "invalid-wrapped-key", aad: "wrap:document:doc-2" },
      ],
      oldTk,
      newTk,
    );

    expect(results[0].newWrappedKey).toBeDefined();
    expect(results[0].error).toBeUndefined();
    expect(results[1].error).toBeDefined();
    expect(results[1].newWrappedKey).toBeUndefined();
  });

  test("document key is preserved across rotation", () => {
    const tk1 = enc.randomKey32();
    const tk2 = enc.randomKey32();
    const tk3 = enc.randomKey32();
    const dk = enc.randomKey32();

    // Wrap with tk1, rotate to tk2, rotate to tk3
    const wrapped1 = envelope.wrapRecordKey(dk, tk1, "wrap:document:doc-x");
    const wrapped2 = service.rewrapDocumentKey(wrapped1, tk1, tk2, "wrap:document:doc-x");
    const wrapped3 = service.rewrapDocumentKey(wrapped2, tk2, tk3, "wrap:document:doc-x");

    const recovered = envelope.unwrapRecordKey(wrapped3, tk3, "wrap:document:doc-x");
    expect(recovered.equals(dk)).toBe(true);
  });
});
