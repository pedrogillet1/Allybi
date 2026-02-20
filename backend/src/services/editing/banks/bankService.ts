import * as fs from "fs";
import * as path from "path";
import { getOptionalBank } from "../../core/banks/bankLoader.service";
import { resolveDataDir } from "../../../utils/resolveDataDir";

const FALLBACK_CATEGORIES = [
  "intent_patterns",
  "lexicons",
  "parsers",
  "semantics",
  "routing",
  "operators",
  "triggers",
  "scope",
  "microcopy",
  "overlays",
  "policies",
  "quality",
  "dictionaries",
  "templates",
  "probes",
];

const cache = new Map<string, unknown | null>();

function shouldAllowFilesystemFallback(): boolean {
  const env = String(process.env.NODE_ENV || "")
    .trim()
    .toLowerCase();
  return env === "test";
}

export function clearEditingBankCache(): void {
  cache.clear();
}

export function safeEditingBank<T = unknown>(id: string): T | null {
  const key = String(id || "").trim();
  if (!key) return null;
  if (cache.has(key)) return (cache.get(key) as T | null) ?? null;

  try {
    const loaded = getOptionalBank<T>(key);
    if (loaded) {
      cache.set(key, loaded as unknown);
      return loaded;
    }
  } catch {
    cache.set(key, null);
    return null;
  }

  if (!shouldAllowFilesystemFallback()) {
    cache.set(key, null);
    return null;
  }

  try {
    const dataDir = resolveDataDir();
    for (const category of FALLBACK_CATEGORIES) {
      const p = path.join(dataDir, category, `${key}.any.json`);
      if (!fs.existsSync(p)) continue;
      const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as T;
      cache.set(key, parsed as unknown);
      return parsed;
    }

    // Fallback by metadata id where filename differs.
    for (const category of FALLBACK_CATEGORIES) {
      const categoryDir = path.join(dataDir, category);
      if (!fs.existsSync(categoryDir)) continue;
      const files = fs
        .readdirSync(categoryDir)
        .filter((name) => name.endsWith(".any.json"));
      for (const file of files) {
        const p = path.join(categoryDir, file);
        try {
          const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
          if (String(parsed?._meta?.id || "").trim() === key) {
            cache.set(key, parsed as unknown);
            return parsed as T;
          }
        } catch {
          // ignore malformed fallback candidate
        }
      }
    }
  } catch {
    cache.set(key, null);
    return null;
  }

  cache.set(key, null);
  return null;
}
