import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@jest/globals";

function resolveBackendRoot(): string {
  const cwd = process.cwd();
  const candidates = [cwd, path.resolve(cwd, "backend")];
  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, "package.json")) &&
      fs.existsSync(path.join(candidate, "scripts"))
    ) {
      return candidate;
    }
  }
  return cwd;
}

describe("Certification: P0 runtime-wiring gate mapping", () => {
  test("runtime-wiring P0 generator targets full runtime-wiring suite", () => {
    const backendRoot = resolveBackendRoot();
    const gateScript = fs.readFileSync(
      path.join(backendRoot, "scripts", "audit", "p0-gates.mjs"),
      "utf8",
    );
    expect(gateScript).toMatch(/"runtime-wiring":\s*"test:runtime-wiring"/);
  });

  test("test:runtime-wiring includes DI integrity and runtime-wiring gate report tests", () => {
    const backendRoot = resolveBackendRoot();
    const pkg = JSON.parse(
      fs.readFileSync(path.join(backendRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const script = String(pkg?.scripts?.["test:runtime-wiring"] || "");
    expect(script).toContain("docint-bank-integrity.test.ts");
    expect(script).toContain("runtime-wiring.cert.test.ts");
  });

  test("p0-gates enforces strict model governance audit", () => {
    const backendRoot = resolveBackendRoot();
    const gateScript = fs.readFileSync(
      path.join(backendRoot, "scripts", "audit", "p0-gates.mjs"),
      "utf8",
    );
    expect(gateScript).toMatch(/runScript\("audit:models:strict"/);
    expect(gateScript).toMatch(/P0-11_MODEL_GOVERNANCE_STRICT_FAILED/);
    expect(gateScript).toMatch(/runScript\("audit:models:consistency"/);
    expect(gateScript).toMatch(/P0-12_MODEL_GOVERNANCE_CONSISTENCY_FAILED/);
  });

  test("p0-gates supports immutable verify mode and explicit repair mode", () => {
    const backendRoot = resolveBackendRoot();
    const gateScript = fs.readFileSync(
      path.join(backendRoot, "scripts", "audit", "p0-gates.mjs"),
      "utf8",
    );
    expect(gateScript).toMatch(/process\.argv\.includes\("--verify-only"\)/);
    expect(gateScript).toMatch(/process\.argv\.includes\("--repair"\)/);
    expect(gateScript).toMatch(/const autoRefresh = repairMode/);
  });

  test("p0-gates summary fails closed when any required check fails", () => {
    const backendRoot = resolveBackendRoot();
    const gateScript = fs.readFileSync(
      path.join(backendRoot, "scripts", "audit", "p0-gates.mjs"),
      "utf8",
    );
    expect(gateScript).toMatch(/const failedChecks = checks/);
    expect(gateScript).toMatch(/P0_GATE_CHECK_FAILED:/);
  });

  test("cert strict verify scripts are wired in package scripts", () => {
    const backendRoot = resolveBackendRoot();
    const pkg = JSON.parse(
      fs.readFileSync(path.join(backendRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    expect(String(pkg?.scripts?.["audit:p0:verify:strict"] || "")).toContain(
      "--verify-only --no-auto-refresh --profile=ci",
    );
    expect(String(pkg?.scripts?.["audit:p0:verify:strict"] || "")).toContain(
      "--scope=p0",
    );
    expect(String(pkg?.scripts?.["audit:cert:verify:strict"] || "")).toContain(
      "run-certification.mjs --verify-only --no-auto-refresh --profile=ci",
    );
    expect(String(pkg?.scripts?.["audit:cert:verify:strict"] || "")).toContain(
      "--scope=cert",
    );
    expect(String(pkg?.scripts?.["cert:preflight:freshness"] || "")).toContain(
      "preflight-gate-freshness.mjs --strict --profile=ci --scope=cert",
    );
  });

  test("run-certification verify-only mode skips evidence bundle packaging", () => {
    const backendRoot = resolveBackendRoot();
    const certScript = fs.readFileSync(
      path.join(backendRoot, "scripts", "certification", "run-certification.mjs"),
      "utf8",
    );
    expect(certScript).toMatch(/process\.argv\.includes\("--verify-only"\)/);
    expect(certScript).toMatch(/verifyOnly[\s\S]*\? null[\s\S]*: packageCertificationEvidence/);
  });

  test("model governance strict audit is manifest-driven", () => {
    const backendRoot = resolveBackendRoot();
    const scriptText = fs.readFileSync(
      path.join(backendRoot, "scripts", "audit", "model-governance-strict.mjs"),
      "utf8",
    );
    expect(scriptText).toContain("model-governance-policy.json");
    expect(scriptText).toContain("model-governance-perimeter.json");
  });

  test("routing SLO enforces canonical routing + scope gate set", () => {
    const backendRoot = resolveBackendRoot();
    const sloScript = fs.readFileSync(
      path.join(backendRoot, "scripts", "audit", "routing-quality-slo.mjs"),
      "utf8",
    );
    expect(sloScript).toMatch(/getGate\("routing-behavioral"\)/);
    expect(sloScript).toMatch(/getGate\("followup-overlay-integrity"\)/);
    expect(sloScript).toMatch(/recordSimpleGateCheck\("collision-matrix-exhaustive"\)/);
    expect(sloScript).toMatch(/recordSimpleGateCheck\("collision-cross-family-tiebreak"\)/);
    expect(sloScript).toMatch(/recordSimpleGateCheck\("routing-determinism"\)/);
    expect(sloScript).toMatch(/recordSimpleGateCheck\("routing-determinism-runtime-e2e"\)/);
    expect(sloScript).toMatch(/recordSimpleGateCheck\("scope-integrity"\)/);
    expect(sloScript).toMatch(/recordSimpleGateCheck\("scope-boundary-locks"\)/);
    expect(sloScript).toMatch(/recordSimpleGateCheck\("slot-contracts-wiring"\)/);
    expect(sloScript).toMatch(/recordSimpleGateCheck\("slot-extraction-e2e"\)/);
    expect(sloScript).toMatch(/recordSimpleGateCheck\("disambiguation-e2e"\)/);
    expect(sloScript).toMatch(/recordSimpleGateCheck\("intent-precision"\)/);
    expect(sloScript).toMatch(/recordSimpleGateCheck\("intent-family-firstclass"\)/);
    expect(sloScript).toMatch(/recordSimpleGateCheck\("routing-bank-consumer-wiring"\)/);
    expect(sloScript).toMatch(/recordSimpleGateCheck\("routing-family-alias-consistency"\)/);
    expect(sloScript).toMatch(/recordSimpleGateCheck\("routing-family-mechanism-contract"\)/);
    expect(sloScript).toMatch(/recordSimpleGateCheck\("routing-integration-intents-parity"\)/);
    expect(sloScript).toMatch(/recordSimpleGateCheck\("nav-intents-locale-parity"\)/);
    expect(sloScript).toMatch(/recordSimpleGateCheck\("telemetry-completeness"\)/);
  });

  test("routing runbook gate inventory stays aligned with enforced SLO gate set", () => {
    const backendRoot = resolveBackendRoot();
    const runbook = fs.readFileSync(
      path.join(backendRoot, "docs", "runtime", "routing-quality-runbook.md"),
      "utf8",
    );
    const requiredGateIds = [
      "routing-behavioral",
      "followup-source-coverage",
      "followup-overlay-integrity",
      "routing-precedence-parity",
      "collision-matrix-exhaustive",
      "collision-cross-family-tiebreak",
      "routing-determinism",
      "routing-determinism-runtime-e2e",
      "scope-integrity",
      "scope-boundary-locks",
      "slot-contracts-wiring",
      "slot-extraction-e2e",
      "disambiguation-e2e",
      "intent-precision",
      "intent-family-firstclass",
      "routing-bank-consumer-wiring",
      "routing-family-alias-consistency",
      "routing-family-conformance",
      "routing-family-mechanism-contract",
      "routing-integration-intents-parity",
      "routing-calc-intents-parity",
      "nav-intents-locale-parity",
      "telemetry-completeness",
      "runtime-wiring",
    ];
    for (const gateId of requiredGateIds) {
      expect(runbook).toContain(`reports/cert/gates/${gateId}.json`);
    }
  });

  test("test:cert:wiring includes routing collision/determinism/scope/slot/disambiguation/precision gates", () => {
    const backendRoot = resolveBackendRoot();
    const pkg = JSON.parse(
      fs.readFileSync(path.join(backendRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const script = String(pkg?.scripts?.["test:cert:wiring"] || "");
    expect(script).toContain("followup-overlay-integrity.cert.test.ts");
    expect(script).toContain("collision-matrix-exhaustive.cert.test.ts");
    expect(script).toContain("collision-cross-family-tiebreak.cert.test.ts");
    expect(script).toContain("routing-determinism.cert.test.ts");
    expect(script).toContain("scope-integrity.cert.test.ts");
    expect(script).toContain("scope-boundary-locks.cert.test.ts");
    expect(script).toContain("slot-contracts-wiring.cert.test.ts");
    expect(script).toContain("slot-extraction-e2e.cert.test.ts");
    expect(script).toContain("disambiguation-e2e.cert.test.ts");
    expect(script).toContain("intent-precision.cert.test.ts");
    expect(script).toContain("intent-family-firstclass.cert.test.ts");
    expect(script).toContain("routing-bank-consumer-wiring.cert.test.ts");
    expect(script).toContain("routing-family-alias-consistency.cert.test.ts");
    expect(script).toContain("routing-family-mechanism-contract.cert.test.ts");
    expect(script).toContain("routing-integration-intents-parity.cert.test.ts");
    expect(script).toContain("nav-intents-locale-parity.cert.test.ts");
    expect(script).toContain("routing-determinism-runtime-e2e.cert.test.ts");
    expect(script).toContain("telemetry-completeness.cert.test.ts");
  });
});
