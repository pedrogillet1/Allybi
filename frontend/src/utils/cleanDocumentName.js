/**
 * cleanDocumentName.js
 *
 * Shared utility to clean document/file/folder names for display.
 * Strips markdown formatting, replaces underscores with spaces,
 * and collapses whitespace — preserving the file extension.
 */
export default function cleanDocumentName(raw) {
  if (!raw) return "";
  let name = String(raw).trim();
  if (!name) return "";

  // Strip path prefix (e.g. "users/.../docs/.../filename.ext" → "filename.ext")
  const slashIdx = name.lastIndexOf("/");
  if (slashIdx >= 0) name = name.slice(slashIdx + 1);

  // Separate extension from base name
  const dotIdx = name.lastIndexOf(".");
  let base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  const ext = dotIdx > 0 ? name.slice(dotIdx) : "";

  // Strip markdown formatting
  base = base.replace(/\*{1,2}/g, "").replace(/`+/g, "").replace(/~{2}/g, "");

  // Replace __ and _ with spaces for readability
  base = base.replace(/__+/g, " ").replace(/_/g, " ");

  // Collapse multiple spaces
  base = base.replace(/\s{2,}/g, " ").trim();

  return (base + ext).trim() || String(raw).trim();
}
