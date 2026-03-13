import { spawnSync } from "child_process";

type SuiteName =
  | "benchmarks"
  | "docint"
  | "doclock"
  | "retrieval"
  | "runtime"
  | "editing"
  | "security"
  | "composition";

const SUITES: Record<SuiteName, string[]> = {
  benchmarks: [
    "src/tests/benchmarks/runBenchmarks.test.ts",
  ],
  docint: [
    "src/tests/document-intelligence/docint-eval-pack.test.ts",
  ],
  doclock: [
    "src/services/core/retrieval/retrievalDocLock.benchmark.test.ts",
  ],
  retrieval: [
    "src/tests/certification/wrong-doc.cert.test.ts",
    "src/tests/certification/truncation.cert.test.ts",
    "src/tests/certification/heuristic-table-guard.cert.test.ts",
    "src/tests/certification/no-lexical-evidence-reparse.cert.test.ts",
    "src/tests/certification/numeric-consistency.cert.test.ts",
    "src/tests/certification/retrieval-behavioral.cert.test.ts",
    "src/tests/certification/retrieval-golden-eval.cert.test.ts",
    "src/tests/certification/scope-resolution.cert.test.ts",
    "src/tests/certification/table-context-types.cert.test.ts",
    "src/tests/certification/table-row-cap.cert.test.ts",
    "src/services/core/retrieval/v2/__tests__/v1-v2-parity.test.ts",
  ],
  runtime: [
    "src/tests/certification/runtime-wiring.cert.test.ts",
    "src/tests/certification/bank-wave-runtime-metadata.cert.test.ts",
    "src/controllers/rag.controller.test.ts",
    "src/services/chat/turnRouter.service.test.ts",
    "src/services/core/banks/runtimeWiringIntegrity.service.test.ts",
    "src/services/core/banks/runtimeWiringProof.service.test.ts",
    "src/modules/chat/runtime/ChatRuntimeOrchestrator.test.ts",
    "src/services/core/retrieval/docScopeLock.test.ts",
    "src/services/core/retrieval/retrievalEngine.scope-lock.test.ts",
    "src/tests/certification/observability-integrity.cert.test.ts",
    "src/tests/certification/runtime-owner-shape.cert.test.ts",
    "src/tests/certification/runtime-microcopy-ban.cert.test.ts",
    "src/tests/certification/control-plane-ownership.cert.test.ts",
    "src/tests/certification/turn-debug-packet.cert.test.ts",
    "src/tests/certification/prompt-mode-coverage.cert.test.ts",
  ],
  editing: [
    "src/tests/certification/editing-roundtrip.cert.test.ts",
    "src/tests/certification/editing-capability-matrix.cert.test.ts",
    "src/tests/certification/editing-eval-suite.cert.test.ts",
    "src/tests/certification/editing-slo.cert.test.ts",
    "src/tests/editing/capabilityMatrix.consistency.test.ts",
    "src/tests/editing/docx_xlsx_bitwise.contract.test.ts",
    "src/tests/editing/xlsx-semantic.test.ts",
    "src/tests/editing/bankMutationProof.test.ts",
  ],
  security: [
    "src/tests/certification/security-auth.cert.test.ts",
    "src/tests/certification/enforcer-failclosed.cert.test.ts",
    "src/tests/certification/evidence-fidelity.cert.test.ts",
    "src/tests/certification/provenance-strictness.cert.test.ts",
    "src/tests/certification/gateway-json-routing.cert.test.ts",
    "src/tests/certification/builder-payload-budget.cert.test.ts",
  ],
  composition: [
    "src/tests/certification/composition-routing.cert.test.ts",
    "src/tests/certification/composition-fallback-order.cert.test.ts",
    "src/tests/certification/composition-pinned-model-resolution.cert.test.ts",
    "src/tests/certification/composition-telemetry-integrity.cert.test.ts",
    "src/tests/certification/composition-analytical-structure.cert.test.ts",
  ],
};

function listSuites(): void {
  const names = Object.keys(SUITES).sort();
  console.log(names.join("\n"));
}

function main(): number {
  const [suiteName, flag] = process.argv.slice(2);
  if (!suiteName || suiteName === "--list-suites") {
    listSuites();
    return suiteName ? 0 : 1;
  }

  if (!(suiteName in SUITES)) {
    console.error(`Unknown jest suite: ${suiteName}`);
    listSuites();
    return 1;
  }

  const suite = SUITES[suiteName as SuiteName];
  if (flag === "--list") {
    console.log(suite.join("\n"));
    return 0;
  }

  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(
    npxCmd,
    [
      "jest",
      "--config",
      "jest.config.cjs",
      "--runInBand",
      "--runTestsByPath",
      ...suite,
    ],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    },
  );

  return result.status ?? 1;
}

process.exit(main());
