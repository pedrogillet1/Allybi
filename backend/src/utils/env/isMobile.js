/**
 * Simple user-agent mobile check (non-hook version).
 * For React components, prefer the useIsMobile() hook instead.
 */
export function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}
