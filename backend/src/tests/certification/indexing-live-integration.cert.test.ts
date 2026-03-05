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
    if (!snapshot.strictFailClosed) {
      failures.push("STRICT_FAIL_CLOSED_DISABLED");
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
        verifyRequired: snapshot.verifyRequired,
      },
      thresholds: {
        runtimeModeAllowed: true,
        strictFailClosed: true,
        verifyRequired: true,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
