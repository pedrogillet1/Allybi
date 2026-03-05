import { describe, expect, test } from "@jest/globals";
import { resolveIndexingPolicySnapshot } from "../../services/retrieval/indexingPolicy.service";
import { getVectorEmbeddingRuntimeMetadata } from "../../services/retrieval/vectorEmbedding.runtime.service";
import { writeCertificationGateReport } from "./reporting";

describe("Certification: indexing live integration", () => {
  test("indexing runtime selector and fail-closed policy are valid for signoff", () => {
    const snapshot = resolveIndexingPolicySnapshot();
    const runtimeMetadata = getVectorEmbeddingRuntimeMetadata();
    const failures: string[] = [];

    if (!runtimeMetadata.modeAllowed) {
      failures.push("RUNTIME_MODE_NOT_ALLOWED");
    }
    if (runtimeMetadata.mode !== "v2") {
      failures.push("RUNTIME_MODE_NOT_V2");
    }
    if (!snapshot.strictFailClosed) {
      failures.push("STRICT_FAIL_CLOSED_DISABLED");
    }
    if (!snapshot.encryptedChunksOnly) {
      failures.push("ENCRYPTED_CHUNKS_ONLY_DISABLED");
    }
    if (!snapshot.verifyRequired) {
      failures.push("VERIFY_REQUIRED_DISABLED");
    }

    writeCertificationGateReport("indexing-live-integration", {
      passed: failures.length === 0,
      metrics: {
        runtimeMode: runtimeMetadata.mode,
        runtimeModeAllowed: runtimeMetadata.modeAllowed,
        allowedModes: runtimeMetadata.allowedModes,
        strictFailClosed: snapshot.strictFailClosed,
        encryptedChunksOnly: snapshot.encryptedChunksOnly,
        verifyRequired: snapshot.verifyRequired,
      },
      thresholds: {
        runtimeMode: "v2",
        runtimeModeAllowed: true,
        strictFailClosed: true,
        encryptedChunksOnly: true,
        verifyRequired: true,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
