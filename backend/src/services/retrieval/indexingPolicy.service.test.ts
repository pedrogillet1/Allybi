import { describe, expect, test } from "@jest/globals";

import {
  isProtectedRuntimeEnv,
  parseBooleanFlag,
  resolveIndexingPolicySnapshot,
  resolveIndexingEncryptionPosture,
  shouldStripPineconePlaintext,
} from "./indexingPolicy.service";

describe("indexingPolicy.service", () => {
  test("parses boolean flags consistently", () => {
    expect(parseBooleanFlag("1", false)).toBe(true);
    expect(parseBooleanFlag("true", false)).toBe(true);
    expect(parseBooleanFlag("yes", false)).toBe(true);
    expect(parseBooleanFlag("on", false)).toBe(true);

    expect(parseBooleanFlag("0", true)).toBe(false);
    expect(parseBooleanFlag("false", true)).toBe(false);
    expect(parseBooleanFlag("no", true)).toBe(false);
    expect(parseBooleanFlag("off", true)).toBe(false);

    expect(parseBooleanFlag("unexpected", true)).toBe(true);
    expect(parseBooleanFlag("unexpected", false)).toBe(false);
  });

  test("uses v2 runtime mode by default and allows both modes", () => {
    const policy = resolveIndexingPolicySnapshot({
      RETRIEVAL_V2_VECTOR_EMBEDDING: "",
    } as NodeJS.ProcessEnv);

    expect(policy.runtimeMode).toBe("v2");
    expect(policy.allowedRuntimeModes).toEqual(["v1", "v2"]);
    expect(policy.runtimeModeAllowed).toBe(true);
  });

  test("protected runtime detector matches production/staging only", () => {
    expect(isProtectedRuntimeEnv("production")).toBe(true);
    expect(isProtectedRuntimeEnv("staging")).toBe(true);
    expect(isProtectedRuntimeEnv("development")).toBe(false);
  });

  test("encryption posture is forced encrypted outside test runtime", () => {
    const posture = resolveIndexingEncryptionPosture({
      NODE_ENV: "development",
      INDEXING_ENCRYPTED_CHUNKS_ONLY: "false",
      INDEXING_ALLOW_PLAINTEXT_CHUNKS: "true",
      INDEXING_PLAINTEXT_OVERRIDE_REASON: "legacy",
    } as NodeJS.ProcessEnv);

    expect(posture.encryptedChunksOnly).toBe(true);
    expect(posture.allowPlaintextChunksOverride).toBe(false);
    expect(posture.plaintextOverrideReason).toBeNull();
  });

  test("test runtime posture can be toggled for harness compatibility", () => {
    const posture = resolveIndexingEncryptionPosture({
      NODE_ENV: "test",
      INDEXING_ENCRYPTED_CHUNKS_ONLY: "false",
    } as NodeJS.ProcessEnv);
    expect(posture.encryptedChunksOnly).toBe(false);
  });

  test("pinecone plaintext strip is forced outside test runtime", () => {
    expect(
      shouldStripPineconePlaintext({
        NODE_ENV: "development",
        INDEXING_ENCRYPTED_CHUNKS_ONLY: "false",
        PINECONE_STRIP_PLAINTEXT: "false",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  test("pinecone plaintext strip preserves test harness compatibility", () => {
    expect(
      shouldStripPineconePlaintext({
        NODE_ENV: "test",
        INDEXING_ENCRYPTED_CHUNKS_ONLY: "false",
        PINECONE_STRIP_PLAINTEXT: "false",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      shouldStripPineconePlaintext({
        NODE_ENV: "test",
        INDEXING_ENCRYPTED_CHUNKS_ONLY: "false",
        PINECONE_STRIP_PLAINTEXT: "true",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  test("fails closed when encrypted-only mode is disabled outside test runtime", () => {
    expect(() =>
      resolveIndexingPolicySnapshot({
        NODE_ENV: "development",
        INDEXING_ENCRYPTED_CHUNKS_ONLY: "false",
      } as NodeJS.ProcessEnv),
    ).toThrow(/Plaintext chunk mode is removed/i);
  });

  test("fails closed when plaintext override flags are configured outside test runtime", () => {
    expect(() =>
      resolveIndexingPolicySnapshot({
        NODE_ENV: "development",
        INDEXING_ALLOW_PLAINTEXT_CHUNKS: "true",
      } as NodeJS.ProcessEnv),
    ).toThrow(/no longer supported/i);
    expect(() =>
      resolveIndexingPolicySnapshot({
        NODE_ENV: "development",
        INDEXING_PLAINTEXT_OVERRIDE_REASON: "legacy",
      } as NodeJS.ProcessEnv),
    ).toThrow(/no longer supported/i);
  });

  test("snapshot preserves strict invariants while forcing encrypted-only posture", () => {
    const policy = resolveIndexingPolicySnapshot({
      NODE_ENV: "development",
      INDEXING_ENCRYPTED_CHUNKS_ONLY: "true",
      INDEXING_ENFORCE_ENCRYPTED_ONLY: "true",
      INDEXING_ENFORCE_CHUNK_METADATA: "true",
      INDEXING_ENFORCE_VERSION_METADATA: "true",
      INDEXING_VERIFY_REQUIRED: "true",
    } as NodeJS.ProcessEnv);

    expect(policy.encryptedChunksOnly).toBe(true);
    expect(policy.allowPlaintextChunksOverride).toBe(false);
    expect(policy.plaintextOverrideReason).toBeNull();
  });

  test("fails closed in protected environments when invariant enforcement flags are disabled", () => {
    expect(() =>
      resolveIndexingPolicySnapshot({
        NODE_ENV: "production",
        INDEXING_ENCRYPTED_CHUNKS_ONLY: "true",
        INDEXING_ENFORCE_CHUNK_METADATA: "false",
      } as NodeJS.ProcessEnv),
    ).toThrow(/Protected runtime requires strict indexing invariants/i);
  });
});
