/**
 * Copy text to clipboard with fallback for older browsers.
 * Returns true on success, false on failure.
 */
export async function copyToClipboard(text) {
  const str = String(text ?? "");
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(str);
      return true;
    }
  } catch {
    // fall through to legacy
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = str;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}
