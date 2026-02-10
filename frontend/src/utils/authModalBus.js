// Lightweight global event bus so non-React code (e.g. axios interceptors)
// can trigger the auth modal without importing React context directly.
//
// Payload shape:
// { mode?: 'login'|'signup', returnTo?: string, reason?: string }

const listeners = new Set();

export function emitAuthModalOpen(payload = {}) {
  for (const fn of listeners) {
    try {
      fn({ type: 'open', payload });
    } catch {
      // ignore listener errors
    }
  }
}

export function emitAuthModalClose(payload = {}) {
  for (const fn of listeners) {
    try {
      fn({ type: 'close', payload });
    } catch {
      // ignore listener errors
    }
  }
}

export function subscribeAuthModalEvents(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

