import { describe, expect, test } from "@jest/globals";

import {
  parseBooleanFlag,
  resolveIndexingPolicySnapshot,
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

  test("marks runtime mode disallowed when mode constraints exclude selected mode", () => {
    const policy = resolveIndexingPolicySnapshot({
      RETRIEVAL_V2_VECTOR_EMBEDDING: "0",
      INDEXING_RUNTIME_MODE_ALLOWED: "v2",
    } as NodeJS.ProcessEnv);

    expect(policy.runtimeMode).toBe("v1");
    expect(policy.allowedRuntimeModes).toEqual(["v2"]);
    expect(policy.runtimeModeAllowed).toBe(false);
  });

  test("fails closed for invalid allowed-mode values", () => {
    const policy = resolveIndexingPolicySnapshot({
      RETRIEVAL_V2_VECTOR_EMBEDDING: "1",
      INDEXING_RUNTIME_MODE_ALLOWED: "invalid_mode",
    } as NodeJS.ProcessEnv);

    expect(policy.allowedRuntimeModes).toEqual([]);
    expect(policy.runtimeModeAllowed).toBe(false);
  });

  test("resolves operational flags from one source of truth", () => {
    const policy = resolveIndexingPolicySnapshot({
      RETRIEVAL_V2_VECTOR_EMBEDDING: "1",
      INDEXING_STRICT_FAIL_CLOSED: "false",
      INDEXING_ENCRYPTED_CHUNKS_ONLY: "false",
      INDEXING_VERIFY_REQUIRED: "0",
      INDEXING_ALLOW_UNVERIFIED_PREVOP_DELETE: "1",
      EMBEDDING_FAILCLOSE_V1: "0",
    } as NodeJS.ProcessEnv);

    expect(policy.runtimeMode).toBe("v2");
    expect(policy.strictFailClosed).toBe(false);
    expect(policy.encryptedChunksOnly).toBe(false);
    expect(policy.verifyRequired).toBe(false);
    expect(policy.allowUnverifiedPreviousOperationDelete).toBe(true);
    expect(policy.embeddingFailCloseV1).toBe(false);
  });

  test("fails closed when encrypted-only is disabled in protected environments", () => {
    expect(() =>
      resolveIndexingPolicySnapshot({
        NODE_ENV: "production",
        INDEXING_ENCRYPTED_CHUNKS_ONLY: "false",
      } as NodeJS.ProcessEnv),
    ).toThrow(/INDEXING_ENCRYPTED_CHUNKS_ONLY=false/);
  });

  test("allows encrypted-only policy in protected environments", () => {
    const policy = resolveIndexingPolicySnapshot({
      NODE_ENV: "production",
      INDEXING_ENCRYPTED_CHUNKS_ONLY: "true",
    } as NodeJS.ProcessEnv);
    expect(policy.encryptedChunksOnly).toBe(true);
  });
});
