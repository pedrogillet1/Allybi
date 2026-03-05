#!/usr/bin/env node

function normalizeBooleanOverride(rawValue) {
  const raw = String(rawValue || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return null;
}

export function resolveCertificationProfile(env = process.env) {
  const raw = String(env.CERT_PROFILE || "").trim().toLowerCase();
  if (raw === "ci" || raw === "release" || raw === "local") return raw;
  return "local";
}

export function resolveCertificationProfileFromArgs({
  args = process.argv,
  env = process.env,
} = {}) {
  const profileArg = (Array.isArray(args) ? args : [])
    .map((arg) => String(arg || "").trim())
    .find((arg) => arg.startsWith("--profile="));
  if (profileArg) {
    const raw = profileArg.split("=", 2)[1]?.trim().toLowerCase() || "";
    if (raw === "ci" || raw === "release" || raw === "local") return raw;
  }
  return resolveCertificationProfile(env);
}

export function isCiRuntime(env = process.env) {
  const ciFlags = [env.CI, env.GITHUB_ACTIONS, env.BUILD_BUILDID]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  return ciFlags.some((value) => value === "1" || value === "true");
}

export function requireLiveRuntimeGraphEvidence({
  profile = resolveCertificationProfile(),
  env = process.env,
} = {}) {
  const override = normalizeBooleanOverride(env.CERT_REQUIRE_RUNTIME_GRAPH_LIVE);
  if (override != null) return override;
  if (profile === "ci" || profile === "release") return true;
  return false;
}

export function resolveQueryLatencyPolicy({
  strict,
  profile = resolveCertificationProfile(),
  hasLatencyInput,
  env = process.env,
}) {
  const force = normalizeBooleanOverride(env.CERT_REQUIRE_QUERY_LATENCY) === true;
  const requiredByProfile =
    strict === true && (profile === "ci" || profile === "release");
  const required = force || requiredByProfile || hasLatencyInput === true;
  return {
    force,
    requiredByProfile,
    required,
  };
}

export function resolveLocalCertRunPolicy({
  strict,
  profile = resolveCertificationProfile(),
  env = process.env,
}) {
  const override = normalizeBooleanOverride(env.CERT_ENFORCE_LOCAL_CERT_RUN);
  if (override != null) return { enforce: override, source: "env_override" };
  const enforce =
    strict === true &&
    (profile === "ci" || profile === "release");
  return { enforce, source: "default_profile_strict" };
}
