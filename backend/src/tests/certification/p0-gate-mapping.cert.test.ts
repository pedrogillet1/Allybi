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

  test("cert strict verify scripts are wired in package scripts", () => {
    const backendRoot = resolveBackendRoot();
    const pkg = JSON.parse(
      fs.readFileSync(path.join(backendRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    expect(String(pkg?.scripts?.["audit:p0:verify:strict"] || "")).toContain(
      "--verify-only --no-auto-refresh --profile=ci",
    );
    expect(String(pkg?.scripts?.["audit:cert:verify:strict"] || "")).toContain(
      "run-certification.mjs --verify-only --no-auto-refresh --profile=ci",
    );
    expect(String(pkg?.scripts?.["cert:preflight:freshness"] || "")).toContain(
      "preflight-gate-freshness.mjs --strict --profile=ci",
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

  test("routing SLO requires canonical routing-behavioral gate id", () => {
    const backendRoot = resolveBackendRoot();
    const sloScript = fs.readFileSync(
      path.join(backendRoot, "scripts", "audit", "routing-quality-slo.mjs"),
      "utf8",
    );
    expect(sloScript).toMatch(/getGate\("routing-behavioral"\)/);
    expect(sloScript).not.toMatch(/getGate\("routing-determinism"\)/);
  });
});
