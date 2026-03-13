export function resolveNodeEnv(): string {
  return String(process.env.NODE_ENV || "development").trim() || "development";
}
