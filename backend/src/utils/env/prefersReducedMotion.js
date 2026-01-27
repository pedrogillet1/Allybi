/**
 * Returns true if the user prefers reduced motion (OS-level accessibility).
 */
export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  return mq?.matches ?? false;
}
