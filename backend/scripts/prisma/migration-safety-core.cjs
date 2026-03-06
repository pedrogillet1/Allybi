const { existsSync, readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const SQLITE_TOKEN_PATTERN = /\bPRAGMA\b|\bDATETIME\b/i;
const DESTRUCTIVE_PATTERN =
  /\bDROP\s+TABLE\b|\bDROP\s+COLUMN\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i;

function parseMigrationTimestamp(entry) {
  const match = /^(\d+)_/.exec(String(entry || ""));
  if (!match) return null;
  const raw = match[1];
  if (!/^\d+$/.test(raw)) return null;
  if (raw.length >= 14) return raw.slice(0, 14);
  if (raw.length === 8) return `${raw}000000`;
  if (raw.length > 8) return raw.padEnd(14, "0");
  return null;
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function loadWaiverConfig(configPath) {
  if (!existsSync(configPath)) {
    return {
      baselineMigrationTimestamp: "00000000000000",
      allowDestructiveMigrations: [],
      allowSqliteTokenMigrations: [],
    };
  }
  const parsed = JSON.parse(readFileSync(configPath, "utf8"));
  return {
    baselineMigrationTimestamp: String(
      parsed?.baselineMigrationTimestamp || "00000000000000",
    ).trim(),
    allowDestructiveMigrations: normalizeArray(
      parsed?.allowDestructiveMigrations,
    ),
    allowSqliteTokenMigrations: normalizeArray(
      parsed?.allowSqliteTokenMigrations,
    ),
  };
}

function scanMigrationSafety(options = {}) {
  const migrationsDir = options.migrationsDir;
  const waiverConfigPath = options.waiverConfigPath;
  const overrideBaseline = String(options.overrideBaseline || "").trim();
  const config = loadWaiverConfig(waiverConfigPath);
  const baseline = overrideBaseline || config.baselineMigrationTimestamp;
  const destructiveAllowed = new Set(config.allowDestructiveMigrations);
  const sqliteAllowed = new Set(config.allowSqliteTokenMigrations);

  const issues = [];
  const scanned = [];

  for (const entry of readdirSync(migrationsDir)) {
    const timestamp = parseMigrationTimestamp(entry);
    if (!timestamp || timestamp <= baseline) continue;

    const migrationSqlPath = join(migrationsDir, entry, "migration.sql");
    if (!existsSync(migrationSqlPath)) continue;
    scanned.push(entry);

    const sql = readFileSync(migrationSqlPath, "utf8");
    if (
      SQLITE_TOKEN_PATTERN.test(sql) &&
      !sqliteAllowed.has(entry) &&
      !sqliteAllowed.has(timestamp)
    ) {
      issues.push({
        migration: entry,
        type: "sqlite_tokens",
        message: "contains sqlite-only tokens (PRAGMA/DATETIME)",
      });
    }
    if (
      DESTRUCTIVE_PATTERN.test(sql) &&
      !destructiveAllowed.has(entry) &&
      !destructiveAllowed.has(timestamp)
    ) {
      issues.push({
        migration: entry,
        type: "destructive_sql",
        message:
          "contains destructive SQL (DROP TABLE/COLUMN, TRUNCATE, DELETE FROM)",
      });
    }
  }

  return {
    baseline,
    scanned,
    issues,
  };
}

module.exports = {
  SQLITE_TOKEN_PATTERN,
  DESTRUCTIVE_PATTERN,
  parseMigrationTimestamp,
  loadWaiverConfig,
  scanMigrationSafety,
};
