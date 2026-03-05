#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCertificationGateSet } from "./certification-gate-manifest.mjs";

function test(name, fn) {
  try {
    fn();
    console.log(`[cert-gate-manifest:test] PASS ${name}`);
  } catch (error) {
    console.error(`[cert-gate-manifest:test] FAIL ${name}`);
    throw error;
  }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function parseGateGenerators() {
  const filePath = path.resolve(ROOT, "scripts/certification/run-certification.mjs");
  const source = fs.readFileSync(filePath, "utf8");
  const match = source.match(/const gateGenerators = \{([\s\S]*?)\n\};/);
  assert.ok(match, "gateGenerators block not found in run-certification.mjs");
  const body = match[1];
  const out = {};
  for (const token of body.matchAll(/"([^"]+)":\s*"([^"]+)"/g)) {
    out[token[1]] = token[2];
  }
  return out;
}

function loadPackageScripts() {
  const pkgPath = path.resolve(ROOT, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  return pkg?.scripts || {};
}

function extractRunTestsByPathArgs(command) {
  const marker = "--runTestsByPath";
  const idx = String(command || "").indexOf(marker);
  if (idx < 0) return [];
  const tail = String(command || "").slice(idx + marker.length).trim();
  const tokens = tail.split(/\s+/).filter(Boolean);
  const out = [];
  for (const token of tokens) {
    if (token.startsWith("--")) break;
    out.push(token.replace(/^['"]|['"]$/g, ""));
  }
  return out;
}

test("p0 scope resolves exactly the six required gates", () => {
  const out = resolveCertificationGateSet({
    scope: "p0",
    strict: true,
    profile: "ci",
    hasQueryLatencyInput: false,
    env: {},
  });
  assert.deepEqual(out.requiredGateIds.sort(), [
    "enforcer-failclosed",
    "evidence-fidelity",
    "runtime-wiring",
    "security-auth",
    "truncation",
    "wrong-doc",
  ]);
  assert.equal(out.optionalGateIds.length, 0);
});

test("cert scope for ci requires latency and retrieval evidence gates", () => {
  const out = resolveCertificationGateSet({
    scope: "cert",
    strict: true,
    profile: "ci",
    hasQueryLatencyInput: false,
    env: {},
  });
  assert.equal(out.requiredGateIds.includes("query-latency"), true);
  assert.equal(out.requiredGateIds.includes("frontend-retrieval-evidence"), true);
  assert.equal(out.requiredGateIds.includes("indexing-live-integration"), true);
  assert.equal(out.requiredGateIds.includes("indexing-storage-invariants"), true);
  assert.equal(out.optionalGateIds.includes("query-latency"), false);
  assert.equal(out.optionalGateIds.includes("frontend-retrieval-evidence"), false);
  assert.equal(out.optionalGateIds.includes("indexing-live-integration"), false);
  assert.equal(out.optionalGateIds.includes("indexing-storage-invariants"), false);
});

test("cert scope for local keeps retrieval evidence gates optional", () => {
  const out = resolveCertificationGateSet({
    scope: "cert",
    strict: true,
    profile: "local",
    hasQueryLatencyInput: false,
    env: {},
  });
  assert.equal(out.requiredGateIds.includes("query-latency"), false);
  assert.equal(out.requiredGateIds.includes("frontend-retrieval-evidence"), false);
  assert.equal(out.requiredGateIds.includes("indexing-live-integration"), false);
  assert.equal(out.requiredGateIds.includes("indexing-storage-invariants"), false);
  assert.equal(out.requiredGateIds.includes("doc-identity-behavioral"), true);
  assert.equal(out.optionalGateIds.includes("query-latency"), true);
  assert.equal(out.optionalGateIds.includes("frontend-retrieval-evidence"), true);
  assert.equal(out.optionalGateIds.includes("indexing-live-integration"), true);
  assert.equal(out.optionalGateIds.includes("indexing-storage-invariants"), true);
});

test("retrieval_signoff requires query-latency and retrieval evidence gates", () => {
  const out = resolveCertificationGateSet({
    scope: "cert",
    strict: true,
    profile: "retrieval_signoff",
    hasQueryLatencyInput: false,
    env: {},
  });
  assert.equal(out.requiredGateIds.includes("query-latency"), true);
  assert.equal(out.requiredGateIds.includes("retrieval-golden-eval"), true);
  assert.equal(out.requiredGateIds.includes("retrieval-realistic-eval"), true);
  assert.equal(out.requiredGateIds.includes("retrieval-openworld-eval"), true);
  assert.equal(out.requiredGateIds.includes("frontend-retrieval-evidence"), true);
  assert.equal(out.requiredGateIds.includes("indexing-live-integration"), true);
  assert.equal(out.requiredGateIds.includes("indexing-storage-invariants"), true);
  assert.equal(out.optionalGateIds.includes("query-latency"), false);
  assert.equal(out.optionalGateIds.includes("frontend-retrieval-evidence"), false);
  assert.equal(out.optionalGateIds.includes("indexing-live-integration"), false);
  assert.equal(out.optionalGateIds.includes("indexing-storage-invariants"), false);
});

test("required and optional gates are always disjoint", () => {
  for (const profile of ["local", "ci", "release", "retrieval_signoff"]) {
    const out = resolveCertificationGateSet({
      scope: "cert",
      strict: true,
      profile,
      hasQueryLatencyInput: true,
      env: {},
    });
    for (const gateId of out.requiredGateIds) {
      assert.equal(
        out.optionalGateIds.includes(gateId),
        false,
        `gate '${gateId}' cannot be both required and optional for profile='${profile}'`,
      );
    }
  }
});

test("every required strict gate has a runnable generator and referenced test paths exist", () => {
  const gateGenerators = parseGateGenerators();
  const scripts = loadPackageScripts();
  const required = new Set();

  for (const profile of ["ci", "retrieval_signoff"]) {
    const out = resolveCertificationGateSet({
      scope: "cert",
      strict: true,
      profile,
      hasQueryLatencyInput: true,
      env: {},
    });
    for (const gateId of out.requiredGateIds) required.add(gateId);
  }

  for (const gateId of required) {
    const generator = String(gateGenerators[gateId] || "").trim();
    assert.ok(generator, `missing generator mapping for required gate '${gateId}'`);

    if (generator.startsWith("jest:path:")) {
      const testPath = generator.slice("jest:path:".length).trim();
      const fullPath = path.resolve(ROOT, testPath);
      assert.ok(
        fs.existsSync(fullPath),
        `inline jest path missing for gate '${gateId}': ${testPath}`,
      );
      continue;
    }

    const scriptCommand = String(scripts[generator] || "").trim();
    assert.ok(scriptCommand, `missing npm script '${generator}' for gate '${gateId}'`);

    const testPaths = extractRunTestsByPathArgs(scriptCommand);
    for (const testPath of testPaths) {
      const fullPath = path.resolve(ROOT, testPath);
      assert.ok(
        fs.existsSync(fullPath),
        `script '${generator}' references missing test path for gate '${gateId}': ${testPath}`,
      );
    }
  }
});

console.log("[cert-gate-manifest:test] all checks passed");
