#!/usr/bin/env node

function normalizeBooleanOverride(rawValue) {
  const raw = String(rawValue || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return null;
}

function isKnownProfile(raw) {
  return (
    raw === "ci" ||
    raw === "release" ||
    raw === "local" ||
    raw === "routing_only" ||
    raw === "retrieval_signoff"
  );
}

export function resolveCertificationProfile(env = process.env) {
  const raw = String(env.CERT_PROFILE || "").trim().toLowerCase();
  if (isKnownProfile(raw)) return raw;
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
    if (isKnownProfile(raw)) return raw;
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
  strict = false,
  env = process.env,
} = {}) {
  const override = normalizeBooleanOverride(env.CERT_REQUIRE_RUNTIME_GRAPH_LIVE);
  if (override != null) return override;
  if (profile === "routing_only") return false;
  if (profile === "retrieval_signoff") return true;
  // Local strict runs may rely on cached runtime-graph evidence.
  // Live evidence is mandatory in CI/release and retrieval signoff.
  if (strict === true && (profile === "ci" || profile === "release")) {
    return true;
  }
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
  if (profile === "routing_only") {
    return {
      force,
      requiredByProfile: false,
      required: false,
    };
  }
  const requiredByProfile =
    profile === "retrieval_signoff" ||
    profile === "ci" ||
    profile === "release";
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
  verifyOnly = false,
  env = process.env,
}) {
  if (profile === "routing_only") {
    return { enforce: false, source: "routing_only_mode" };
  }
  if (verifyOnly === true && profile !== "retrieval_signoff") {
    return { enforce: false, source: "verify_only_mode" };
  }
  const override = normalizeBooleanOverride(env.CERT_ENFORCE_LOCAL_CERT_RUN);
  if (override != null) return { enforce: override, source: "env_override" };
  // Default strict enforcement to CI/release profiles.
  // Retrieval signoff can opt in explicitly via CERT_ENFORCE_LOCAL_CERT_RUN.
  const enforce =
    strict === true && (profile === "ci" || profile === "release");
  return { enforce, source: "default_profile_strict" };
}
