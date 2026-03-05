const { spawnSync } = require("node:child_process");
const { URL } = require("node:url");

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function isPlaceholderDatabaseUrl(raw) {
  if (!raw) return true;
  const knownPlaceholders = ["USER", "PASSWORD", "HOST", "DB_NAME"];
  if (knownPlaceholders.some((token) => raw.includes(token))) return true;

  try {
    const parsed = new URL(raw);
    if (!parsed.hostname || parsed.hostname.toUpperCase() === "HOST") return true;
    if (!parsed.username || parsed.username.toUpperCase() === "USER") return true;
    if (!parsed.password || parsed.password.toUpperCase() === "PASSWORD")
      return true;
    const dbName = parsed.pathname.replace(/^\//, "");
    if (!dbName || dbName.toUpperCase() === "DB_NAME") return true;
    return false;
  } catch {
    return true;
  }
}

function getReplayEnvError(env) {
  const dbUrl = env.DATABASE_URL;
  const directDbUrl = env.DIRECT_DATABASE_URL;

  if (isPlaceholderDatabaseUrl(dbUrl)) {
    return "[prisma:replay:check] invalid DATABASE_URL. Configure a real Postgres URL (see .env.example).";
  }
  if (directDbUrl && isPlaceholderDatabaseUrl(directDbUrl)) {
    return "[prisma:replay:check] invalid DIRECT_DATABASE_URL. Configure a real direct Postgres URL or unset it.";
  }
  return null;
}

function assertReplayEnv(env = process.env) {
  const replayEnvError = getReplayEnvError(env);
  if (replayEnvError) {
    throw new Error(replayEnvError);
  }
}

module.exports = {
  run,
  isPlaceholderDatabaseUrl,
  assertReplayEnv,
};
