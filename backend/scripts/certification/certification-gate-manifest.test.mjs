#!/usr/bin/env node
import assert from "node:assert/strict";
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

test("cert scope for ci keeps query-latency optional without input", () => {
  const out = resolveCertificationGateSet({
    scope: "cert",
    strict: true,
    profile: "ci",
    hasQueryLatencyInput: false,
    env: {},
  });
  assert.equal(out.requiredGateIds.includes("query-latency"), false);
  assert.equal(out.optionalGateIds.includes("query-latency"), true);
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
  assert.equal(out.requiredGateIds.includes("frontend-retrieval-evidence"), true);
  assert.equal(out.requiredGateIds.includes("indexing-live-integration"), true);
});

console.log("[cert-gate-manifest:test] all checks passed");
