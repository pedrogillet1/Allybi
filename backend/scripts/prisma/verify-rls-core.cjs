const PROFILE_REQUIRE_SERVICE_ROLE = new Map([
  ["ci", false],
  ["dev", false],
  ["development", false],
  ["local", false],
  ["test", false],
  ["staging", true],
  ["prod", true],
  ["production", true],
]);

function parseBoolToken(raw) {
  const normalized = String(raw || "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function resolveProfile(env = process.env) {
  const raw = String(env.PRISMA_RLS_PROFILE || "")
    .trim()
    .toLowerCase();
  if (!raw || raw === "auto") {
    const nodeEnv = String(env.NODE_ENV || "")
      .trim()
      .toLowerCase();
    if (nodeEnv === "production" || nodeEnv === "staging") {
      return "prod";
    }
    return "dev";
  }

  if (!PROFILE_REQUIRE_SERVICE_ROLE.has(raw)) {
    throw new Error(
      `[prisma:rls:verify] unsupported PRISMA_RLS_PROFILE="${raw}". Supported: ${[
        ...PROFILE_REQUIRE_SERVICE_ROLE.keys(),
      ].join(", ")}, auto`,
    );
  }
  return raw;
}

function resolveRequireServiceRole(profile, env = process.env) {
  const overrideRaw = String(env.PRISMA_RLS_REQUIRE_SERVICE_ROLE || "").trim();
  if (overrideRaw) {
    const parsed = parseBoolToken(overrideRaw);
    if (typeof parsed !== "boolean") {
      throw new Error(
        `[prisma:rls:verify] invalid PRISMA_RLS_REQUIRE_SERVICE_ROLE="${overrideRaw}"`,
      );
    }
    return parsed;
  }
  return Boolean(PROFILE_REQUIRE_SERVICE_ROLE.get(profile));
}

module.exports = {
  PROFILE_REQUIRE_SERVICE_ROLE,
  parseBoolToken,
  resolveProfile,
  resolveRequireServiceRole,
};
