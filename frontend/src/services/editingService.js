import api from './api';

export function extractVerifiedApply(response) {
  const result = response?.result || response || {};
  const receipt = result?.receipt || response?.receipt;
  const outcomeType = String(result?.outcomeType || response?.outcomeType || '').trim().toLowerCase();
  const newRevisionId =
    result?.newRevisionId ||
    result?.revisionId ||
    result?.restoredRevisionId ||
    result?.documentId ||
    result?.receipt?.revisionId ||
    result?.receipt?.documentId ||
    response?.revisionId ||
    response?.documentId ||
    response?.receipt?.revisionId ||
    response?.receipt?.documentId ||
    null;
  const proof = result?.proof || response?.proof || null;
  const changeset = result?.changeset || response?.changeset || null;
  const hasChanges =
    Number(changeset?.changeCount || 0) > 0 ||
    Boolean(changeset?.changed) ||
    (typeof changeset?.summary === 'string' && changeset.summary.trim().length > 0);
  const explicitlyNoop = outcomeType === 'noop' || (result?.applied === false && receipt?.stage === 'noop');
  const proofExplicitlyVerified = proof?.verified === true;
  const proofPresentButNotVerified = proof && proof?.verified === false;
  const verified = (proofPresentButNotVerified || explicitlyNoop)
    ? false
    : Boolean(newRevisionId) && (
      proofExplicitlyVerified
        ? (hasChanges || !changeset || result?.applied === true)
        : (hasChanges || result?.applied === true)
    );
  return { verified, newRevisionId, proof, changeset };
}

export function isNoopResult(response) {
  const result = response?.result || response || {};
  const outcomeType = String(result?.outcomeType || response?.outcomeType || '').trim().toLowerCase();
  if (outcomeType === 'noop') return true;
  if (result?.applied === false && outcomeType && outcomeType !== 'noop') return false;
  const receipt = result?.receipt || response?.receipt;
  if (receipt?.stage === 'noop') return true;
  const note = String(receipt?.note || '').trim();
  if (note.startsWith('EDIT_NOOP')) return true;
  return false;
}

export async function applyEdit(payload) {
  try {
    const res = await api.post('/api/editing/apply', payload);
    // Backend uses { ok: true, data: { ... } } envelope.
    // Normalize so callers can access `result.revisionId` directly.
    if (res?.data && typeof res.data === 'object' && res.data.ok === true && res.data.data) {
      const normalized = res.data.data;
      return {
        ...normalized,
        verifiedApply: extractVerifiedApply(normalized),
      };
    }
    return {
      ...(res.data || {}),
      verifiedApply: extractVerifiedApply(res.data),
    };
  } catch (e) {
    // Special case: backend can return 409 with `{ ok: true, data: ... }` when
    // an edit requires user confirmation / target choice (apply is blocked).
    // Axios treats non-2xx as errors; normalize this into a regular response.
    const status = e?.response?.status;
    const data = e?.response?.data;
    if (status === 409 && data && typeof data === 'object' && data.ok === true && data.data) {
      const normalized = data.data;
      return {
        ...normalized,
        verifiedApply: extractVerifiedApply(normalized),
      };
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
