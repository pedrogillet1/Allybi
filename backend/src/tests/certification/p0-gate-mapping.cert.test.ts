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
});
