#!/usr/bin/env node
import { resolveQueryLatencyPolicy } from "./certification-policy.mjs";

export const P0_REQUIRED_GATE_IDS = [
  "wrong-doc",
  "truncation",
  "runtime-wiring",
  "enforcer-failclosed",
  "evidence-fidelity",
  "security-auth",
];

const BASE_REQUIRED_GATE_IDS = [
  "wrong-doc",
  "truncation",
  "persistence-restart",
  "editing-roundtrip",
  "editing-capabilities",
  "editing-eval-suite",
  "editing-slo",
  "runtime-wiring",
  "enforcer-failclosed",
  "evidence-fidelity",
  "provenance-strictness",
  "prompt-mode-coverage",
  "composition-routing",
  "composition-fallback-order",
  "composition-pinned-model-resolution",
  "composition-telemetry-integrity",
  "composition-analytical-structure",
  "builder-payload-budget",
  "gateway-json-routing",
  "collision-matrix-exhaustive",
  "telemetry-completeness",
  "rollout-safety",
  "turn-debug-packet",
  "security-auth",
  "observability-integrity",
  "doc-identity-behavioral",
  "retrieval-behavioral",
];

const RETRIEVAL_SIGNOFF_REQUIRED_GATE_IDS = [
  "query-latency",
  "retrieval-golden-eval",
  "retrieval-realistic-eval",
  "retrieval-openworld-eval",
  "frontend-retrieval-evidence",
  "indexing-live-integration",
];

const CI_RELEASE_REQUIRED_GATE_IDS = [
  "frontend-retrieval-evidence",
  "indexing-live-integration",
];

function normalizeBoolean(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return null;
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function difference(left, rightSet) {
  return left.filter((item) => !rightSet.has(item));
}

export function resolveCertificationGateSet({
  scope = "cert",
  strict = false,
  profile = "local",
  hasQueryLatencyInput = false,
  env = process.env,
} = {}) {
  const normalizedScope = String(scope || "").trim().toLowerCase() === "p0"
    ? "p0"
    : "cert";
  if (normalizedScope === "p0") {
    return {
      scope: "p0",
      requiredGateIds: [...P0_REQUIRED_GATE_IDS],
      optionalGateIds: [],
      skippedOptionalGates: [],
      queryLatencyPolicy: {
        force: false,
        requiredByProfile: false,
        required: false,
      },
      requireLiveIndexing: false,
    };
  }

  const requiredGateIds = [...BASE_REQUIRED_GATE_IDS];
  const optionalCandidates = [
    "query-latency",
    "frontend-retrieval-evidence",
    "indexing-live-integration",
  ];
  const skippedOptionalGates = [];

  const queryLatencyPolicy = resolveQueryLatencyPolicy({
    strict,
    profile,
    hasLatencyInput: hasQueryLatencyInput,
    env,
  });

  if (queryLatencyPolicy.required) {
    requiredGateIds.push("query-latency");
  } else {
    skippedOptionalGates.push({
      gateId: "query-latency",
      criticality: "optional",
      reason: hasQueryLatencyInput ? "policy_optional" : "missing_per_query_report",
    });
  }

  const frontendEvidenceOverride = normalizeBoolean(
    env.CERT_REQUIRE_FRONTEND_RETRIEVAL_EVIDENCE,
  );
  const requireFrontendEvidence = profile === "retrieval_signoff" ||
    profile === "ci" ||
    profile === "release" ||
    frontendEvidenceOverride === true;
  if (requireFrontendEvidence) {
    requiredGateIds.push("frontend-retrieval-evidence");
  } else {
    skippedOptionalGates.push({
      gateId: "frontend-retrieval-evidence",
      criticality: "optional",
      reason: "profile_or_env_not_frontend_retrieval_evidence",
    });
  }

  const liveIndexingOverride = normalizeBoolean(env.CERT_REQUIRE_LIVE_INDEXING);
  const requireLiveIndexing = profile === "retrieval_signoff" ||
    profile === "ci" ||
    profile === "release" ||
    liveIndexingOverride === true;
  if (requireLiveIndexing) {
    requiredGateIds.push("indexing-live-integration");
  } else {
    skippedOptionalGates.push({
      gateId: "indexing-live-integration",
      criticality: "optional",
      reason: "profile_or_env_not_live_indexing",
    });
  }

  if (profile === "ci" || profile === "release") {
    requiredGateIds.push(...CI_RELEASE_REQUIRED_GATE_IDS);
  }

  if (profile === "retrieval_signoff") {
    requiredGateIds.push(...RETRIEVAL_SIGNOFF_REQUIRED_GATE_IDS);
  }

  const requiredSet = new Set(unique(requiredGateIds));
  const optionalGateIds = difference(optionalCandidates, requiredSet);

  return {
    scope: "cert",
    requiredGateIds: Array.from(requiredSet),
    optionalGateIds,
    skippedOptionalGates,
    queryLatencyPolicy,
    requireLiveIndexing,
  };
}
