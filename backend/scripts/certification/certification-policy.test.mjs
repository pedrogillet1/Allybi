#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  requireLiveRuntimeGraphEvidence,
  resolveCertificationProfileFromArgs,
  resolveLocalCertRunPolicy,
  resolveQueryLatencyPolicy,
} from "./certification-policy.mjs";

function test(name, fn) {
  try {
    fn();
    console.log(`[cert-policy:test] PASS ${name}`);
  } catch (error) {
    console.error(`[cert-policy:test] FAIL ${name}`);
    throw error;
  }
}

test("resolve profile from args supports retrieval_signoff", () => {
  const profile = resolveCertificationProfileFromArgs({
    args: ["node", "script", "--profile=retrieval_signoff"],
    env: {},
  });
  assert.equal(profile, "retrieval_signoff");
});

test("query latency is always required for retrieval_signoff", () => {
  const policy = resolveQueryLatencyPolicy({
    strict: false,
    profile: "retrieval_signoff",
    hasLatencyInput: false,
    env: {},
  });
  assert.equal(policy.requiredByProfile, true);
  assert.equal(policy.required, true);
});

test("local cert run is enforced for retrieval_signoff even in verify-only mode", () => {
  const policy = resolveLocalCertRunPolicy({
    strict: false,
    profile: "retrieval_signoff",
    verifyOnly: true,
    env: {},
  });
  assert.equal(policy.enforce, true);
});

test("runtime graph live evidence required for retrieval_signoff", () => {
  const required = requireLiveRuntimeGraphEvidence({
    profile: "retrieval_signoff",
    strict: false,
    env: {},
  });
  assert.equal(required, true);
});

test("runtime graph live evidence is not required for strict local by default", () => {
  const required = requireLiveRuntimeGraphEvidence({
    profile: "local",
    strict: true,
    env: {},
  });
  assert.equal(required, false);
});

test("runtime graph live evidence override forces strict local mode", () => {
  const required = requireLiveRuntimeGraphEvidence({
    profile: "local",
    strict: true,
    env: { CERT_REQUIRE_RUNTIME_GRAPH_LIVE: "1" },
  });
  assert.equal(required, true);
});

console.log("[cert-policy:test] all checks passed");
