#!/usr/bin/env node
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function containsAll(source, required) {
  return required.filter((token) => !source.includes(token));
}

function shouldRequireQueryLatency(profile) {
  return (
    profile === "ci" || profile === "release" || profile === "retrieval_signoff"
  );
}

function hasOwn(input, key) {
  return Object.prototype.hasOwnProperty.call(input || {}, key);
}

function main() {
  const strict = process.argv.includes("--strict");
  const rootDir = path.resolve(process.cwd());
  const profile = String(process.env.CERT_PROFILE || "local")
    .trim()
    .toLowerCase();

  const checks = [
    {
      id: "trace_writer_query_telemetry_contract",
      filePath: path.resolve(
        rootDir,
        "src/services/telemetry/traceWriter.service.ts",
      ),
      requiredTokens: [
        "async upsertQueryTelemetry(",
        "intent?: string | null;",
        "evidenceGateAction?: string | null;",
        "operatorChoice?: string | null;",
        "totalMs?: number | null;",
        "retrievalMs?: number | null;",
        "llmMs?: number | null;",
        "estimatedCostUsd?: number | null;",
      ],
    },
    {
      id: "runtime_delegate_trace_fields",
      filePath: path.resolve(
        rootDir,
        "src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts",
      ),
      requiredTokens: [
        "persistTraceArtifacts(",
        "estimatedCostUsd",
        "operatorChoice: routingTelemetry.operatorChoice",
        "scopeDecision: routingTelemetry.scopeDecision",
      ],
    },
    {
      id: "runtime_delegate_v2_trace_fields",
      filePath: path.resolve(
        rootDir,
        "src/modules/chat/runtime/CentralizedChatRuntimeDelegate.v2.ts",
      ),
      requiredTokens: [
        "persistTraceArtifacts(",
        "estimatedCostUsd",
        "operatorChoice: routingTelemetry.operatorChoice",
        "scopeDecision: routingTelemetry.scopeDecision",
      ],
    },
    {
      id: "admin_telemetry_routes_surface_quality_and_live_debug",
      filePath: path.resolve(
        rootDir,
        "src/entrypoints/http/routes/admin-telemetry.routes.ts",
      ),
      requiredTokens: [
        'router.get("/quality/reask-rate", adminTelemetryReaskRate);',
        'router.get("/quality/truncation-rate", adminTelemetryTruncationRate);',
        'router.get("/quality/regeneration-rate", adminTelemetryRegenerationRate);',
        'router.get("/live/events", adminTelemetryLiveFeed);',
      ],
    },
    {
      id: "ingestion_slo_cert_gate_script_wired",
      filePath: path.resolve(rootDir, "package.json"),
      requiredTokens: [
        "\"audit:ingestion:slo:cert:strict\": \"node scripts/audit/ingestion-slo-cert-gate.mjs --strict\"",
        "\"audit:cert:strict\": \"node scripts/certification/run-certification.mjs --profile=ci && npm run -s audit:routing:grade:strict:ci && npm run audit:ingestion:slo:cert:strict",
      ],
    },
    {
      id: "ingestion_slo_runbook_present",
      filePath: path.resolve(rootDir, "docs/runtime/ingestion-quality-runbook.md"),
      requiredTokens: [
        "audit:ingestion:slo:cert:strict",
        "INGESTION_SLO_MIN_DOCS",
        "ingestion_global_p95_exceeded",
      ],
    },
    {
      id: "governance_quality_gates_runbook_present",
      filePath: path.resolve(
        rootDir,
        "docs/runtime/llm-governance-quality-gates-runbook.md",
      ),
      requiredTokens: [
        "governance_gate_fail_total",
        "governance_fail_soft_mode_total",
        "source_policy_violation_total",
        "quality_gate_blocked",
        "quality_gate_runner_error",
        "enforcer_runtime_error",
        "audit:observability:ops-contract:strict",
      ],
    },
  ];

  const failures = [];
  const warnings = [];
  const fileChecks = [];

  for (const check of checks) {
    if (!fs.existsSync(check.filePath)) {
      failures.push(`${check.id}:MISSING_FILE`);
      fileChecks.push({
        id: check.id,
        filePath: check.filePath,
        missingTokens: check.requiredTokens,
      });
      continue;
    }

    const source = readFile(check.filePath);
    const missingTokens = containsAll(source, check.requiredTokens);
    if (missingTokens.length > 0) {
      failures.push(`${check.id}:TOKENS_MISSING`);
    }
    fileChecks.push({
      id: check.id,
      filePath: check.filePath,
      missingTokens,
    });
  }

  const summaryPath = path.resolve(
    rootDir,
    "reports/cert/certification-summary.json",
  );
  const summary = readJsonSafe(summaryPath);
  if (!summary) {
    if (strict) failures.push("MISSING_CERTIFICATION_SUMMARY");
    else warnings.push("MISSING_CERTIFICATION_SUMMARY");
  } else {
    const gates = Array.isArray(summary?.gates) ? summary.gates : [];
    const gatesById = new Map(
      gates.map((gate) => [String(gate?.gateId || "").trim(), gate]),
    );
    const requiredGateIds = [
      "telemetry-completeness",
      "observability-integrity",
      "turn-debug-packet",
      "rollout-safety",
    ];
    if (shouldRequireQueryLatency(profile)) requiredGateIds.push("query-latency");

    const gateContracts = {
      "telemetry-completeness": {
        metrics: [
          "delegatesCovered",
          "delegatesExpected",
          "negativeFixturesCovered",
          "negativeFixturesExpected",
          "intentFieldsCovered",
          "intentFieldsExpected",
          "evidenceFieldsCovered",
          "evidenceFieldsExpected",
          "costFieldsCovered",
          "costFieldsExpected",
          "latencyFieldsCovered",
          "latencyFieldsExpected",
          "intentCoverageRate",
          "evidenceCoverageRate",
          "costCoverageRate",
          "latencyCoverageRate",
        ],
        thresholds: [
          "delegatesCovered",
          "negativeFixturesCovered",
          "intentFieldsCovered",
          "evidenceFieldsCovered",
          "costFieldsCovered",
          "latencyFieldsCovered",
          "intentCoverageRateMin",
          "evidenceCoverageRateMin",
          "costCoverageRateMin",
          "latencyCoverageRateMin",
        ],
      },
      "observability-integrity": {
        metrics: [
          "traceSpansPersisted",
          "requiredStepCount",
          "traceTypeMissingCount",
          "delegateSpanMissingCount",
          "strictModeWiringPresent",
        ],
        thresholds: [
          "traceSpansPersisted",
          "traceTypeMissingCount",
          "delegateSpanMissingCount",
          "strictModeWiringPresent",
        ],
      },
      "turn-debug-packet": {
        metrics: [
          "hasPacket",
          "docScopeMode",
          "allowedDocumentIdsCount",
          "retrievalCandidates",
          "retrievalSelected",
          "hasSelectionRationale",
          "selectedSectionRuleId",
          "hasEvidenceMapHash",
          "hasTokenBudget",
        ],
        thresholds: [
          "hasPacket",
          "docScopeMode",
          "minAllowedDocumentIdsCount",
          "minRetrievalCandidates",
          "minRetrievalSelected",
          "hasSelectionRationale",
          "selectedSectionRuleId",
          "hasEvidenceMapHash",
          "hasTokenBudget",
        ],
      },
      "rollout-safety": {
        metrics: [
          "rolloutSafetyEnabled",
          "highRiskFlagCount",
          "highRiskCanaryPolicyCount",
          "canaryRecommendation",
          "thresholdMinSampleSize",
          "thresholdMaxErrorRate",
          "thresholdMaxP95LatencyMs",
          "thresholdMaxWeakEvidenceRate",
          "canaryEnforcementWired",
        ],
        thresholds: [
          "rolloutSafetyEnabled",
          "highRiskFlagCountMin",
          "highRiskCanaryPolicyCountMin",
          "canaryRecommendation",
          "canaryEnforcementWired",
        ],
      },
      "query-latency": {
        metrics: [
          "totalQueries",
          "p95LatencyMs",
          "errorRate",
          "timeoutRate",
        ],
        thresholds: ["p95LatencyMsMax", "errorRateMax", "timeoutRateMax"],
      },
    };

    for (const gateId of requiredGateIds) {
      const gate = gatesById.get(gateId);
      if (!gate) {
        failures.push(`MISSING_GATE:${gateId}`);
        continue;
      }
      if (gate?.passed !== true) {
        failures.push(`FAILED_GATE:${gateId}`);
      }

      const gatePath = path.resolve(rootDir, "reports/cert/gates", `${gateId}.json`);
      const gateArtifact = readJsonSafe(gatePath);
      if (!gateArtifact) {
        failures.push(`MISSING_GATE_ARTIFACT:${gateId}`);
        continue;
      }

      const contract = gateContracts[gateId];
      if (!contract) continue;
      const metrics = gateArtifact?.metrics || {};
      const thresholds = gateArtifact?.thresholds || {};
      for (const metricKey of contract.metrics) {
        if (!hasOwn(metrics, metricKey)) {
          failures.push(`GATE_METRIC_MISSING:${gateId}:${metricKey}`);
        }
      }
      for (const thresholdKey of contract.thresholds) {
        if (!hasOwn(thresholds, thresholdKey)) {
          failures.push(`GATE_THRESHOLD_MISSING:${gateId}:${thresholdKey}`);
        }
      }
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    strict,
    profile,
    summaryPath,
    fileChecks,
    failures,
    warnings,
    passed: failures.length === 0,
  };

  console.log(JSON.stringify(output, null, 2));
  if (!output.passed) process.exit(1);
}

main();
