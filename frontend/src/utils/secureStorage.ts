/**
 * Wrapper preventing sensitive data from being stored in localStorage.
 * Only allows known-safe prefixes (UI preferences, theme, lang).
 */

const ALLOWED_PREFIXES = ["theme", "lang", "ui", "sidebar", "layout", "locale"];

export const secureStorage = {
  set(key: string, value: string) {
    if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[secureStorage] Blocked storing potentially sensitive key in localStorage: ${key}`,
        );
      }
      throw new Error(
        `Blocked storing potentially sensitive key in localStorage: ${key}`,
      );
    }
    localStorage.setItem(key, value);
  },
  get(key: string): string | null {
    return localStorage.getItem(key);
  },
  remove(key: string) {
    localStorage.removeItem(key);
  },
};
