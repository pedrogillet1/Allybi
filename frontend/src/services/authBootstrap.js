import { getApiBaseUrl } from './runtimeConfig';

export async function fetchBootstrapSession() {
  const apiBase = getApiBaseUrl();
  const opts = { credentials: 'include' };

  try {
    const bootstrapRes = await fetch(`${apiBase}/api/auth/session/bootstrap`, opts);
    if (bootstrapRes.ok) {
      const data = await bootstrapRes.json();
      return data?.user ? { ok: true, user: data.user, source: 'bootstrap' } : { ok: false };
    }
    if (bootstrapRes.status !== 404) return { ok: false, status: bootstrapRes.status };
  } catch {
    // Continue to /me fallback.
  }

  try {
    const meRes = await fetch(`${apiBase}/api/auth/me`, opts);
    if (!meRes.ok) return { ok: false, status: meRes.status };
    const data = await meRes.json();
    return data?.user ? { ok: true, user: data.user, source: 'me' } : { ok: false };
  } catch {
    return { ok: false };
  }
}
