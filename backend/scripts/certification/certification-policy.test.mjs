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

test("resolve profile from args supports routing_only", () => {
  const profile = resolveCertificationProfileFromArgs({
    args: ["node", "script", "--profile=routing_only"],
    env: {},
  });
  assert.equal(profile, "routing_only");
});

test("resolve profile from args supports local_hard", () => {
  const profile = resolveCertificationProfileFromArgs({
    args: ["node", "script", "--profile=local_hard"],
    env: {},
  });
  assert.equal(profile, "local_hard");
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

test("query latency is always required for ci profile", () => {
  const policy = resolveQueryLatencyPolicy({
    strict: true,
    profile: "ci",
    hasLatencyInput: false,
    env: {},
  });
  assert.equal(policy.requiredByProfile, true);
  assert.equal(policy.required, true);
});

test("local cert run is not enforced by default for retrieval_signoff", () => {
  const policy = resolveLocalCertRunPolicy({
    strict: false,
    profile: "retrieval_signoff",
    verifyOnly: true,
    env: {},
  });
  assert.equal(policy.enforce, false);
  assert.equal(policy.source, "default_profile_strict");
});

test("local cert run is enforced by default for strict ci profile", () => {
  const policy = resolveLocalCertRunPolicy({
    strict: true,
    profile: "ci",
    verifyOnly: false,
    env: {},
  });
  assert.equal(policy.enforce, true);
  assert.equal(policy.source, "default_profile_strict");
});

test("local cert run can be enforced for ci profile via env override", () => {
  const policy = resolveLocalCertRunPolicy({
    strict: true,
    profile: "ci",
    verifyOnly: false,
    env: { CERT_ENFORCE_LOCAL_CERT_RUN: "1" },
  });
  assert.equal(policy.enforce, true);
  assert.equal(policy.source, "env_override");
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

test("routing_only profile does not require live runtime graph evidence by default", () => {
  const required = requireLiveRuntimeGraphEvidence({
    profile: "routing_only",
    strict: true,
    env: {},
  });
  assert.equal(required, false);
});

test("routing_only profile does not enforce local cert run health", () => {
  const policy = resolveLocalCertRunPolicy({
    strict: true,
    profile: "routing_only",
    verifyOnly: false,
    env: {},
  });
  assert.equal(policy.enforce, false);
});

test("local_hard profile enforces local cert run health in strict mode", () => {
  const policy = resolveLocalCertRunPolicy({
    strict: true,
    profile: "local_hard",
    verifyOnly: false,
    env: {},
  });
  assert.equal(policy.enforce, true);
  assert.equal(policy.source, "local_hard_profile");
});

test("local_hard profile can disable enforcement via env override", () => {
  const policy = resolveLocalCertRunPolicy({
    strict: true,
    profile: "local_hard",
    verifyOnly: false,
    env: { CERT_ENFORCE_LOCAL_CERT_RUN: "0" },
  });
  assert.equal(policy.enforce, false);
  assert.equal(policy.source, "env_override");
});

test("routing_only profile does not require query latency", () => {
  const policy = resolveQueryLatencyPolicy({
    strict: true,
    profile: "routing_only",
    hasLatencyInput: false,
    env: {},
  });
  assert.equal(policy.required, false);
});

console.log("[cert-policy:test] all checks passed");
