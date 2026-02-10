import api from './api';

export async function applyEdit(payload) {
  try {
    const res = await api.post('/api/editing/apply', payload);
    // Backend uses { ok: true, data: { ... } } envelope.
    // Normalize so callers can access `result.revisionId` directly.
    if (res?.data && typeof res.data === 'object' && res.data.ok === true && res.data.data) {
      return res.data.data;
    }
    return res.data;
  } catch (e) {
    // Special case: backend can return 409 with `{ ok: true, data: ... }` when
    // an edit requires user confirmation / target choice (apply is blocked).
    // Axios treats non-2xx as errors; normalize this into a regular response.
    const status = e?.response?.status;
    const data = e?.response?.data;
    if (status === 409 && data && typeof data === 'object' && data.ok === true && data.data) {
      return data.data;
    }
    throw e;
  }
}

export async function undoEdit(payload) {
  try {
    const res = await api.post('/api/editing/undo', payload);
    if (res?.data && typeof res.data === 'object' && res.data.ok === true && res.data.data) {
      return res.data.data;
    }
    return res.data;
  } catch (e) {
    throw e;
  }
}
