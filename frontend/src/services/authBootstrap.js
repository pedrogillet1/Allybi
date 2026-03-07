import { getApiBaseUrl } from './runtimeConfig';

const BOOTSTRAP_TIMEOUT_MS = 10_000;

export async function fetchBootstrapSession() {
  const apiBase = getApiBaseUrl();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BOOTSTRAP_TIMEOUT_MS);
    const bootstrapRes = await fetch(`${apiBase}/api/auth/session/bootstrap`, {
      credentials: 'include',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (bootstrapRes.ok) {
      const data = await bootstrapRes.json();
      return data?.user ? { ok: true, user: data.user, source: 'bootstrap' } : { ok: false };
    }
    if (bootstrapRes.status !== 404) return { ok: false, status: bootstrapRes.status };
  } catch {
    // Continue to /me fallback.
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BOOTSTRAP_TIMEOUT_MS);
    const meRes = await fetch(`${apiBase}/api/auth/me`, {
      credentials: 'include',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!meRes.ok) return { ok: false, status: meRes.status };
    const data = await meRes.json();
    return data?.user ? { ok: true, user: data.user, source: 'me' } : { ok: false };
  } catch {
    return { ok: false };
  }
}
