function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderSuggestionHtml(diffParts) {
  const parts = Array.isArray(diffParts) ? diffParts : [];
  if (!parts.length) return "";

  const html = parts
    .map((p) => {
      const t = escapeHtml(p.text || "");
      if (!t) return "";
      if (p.type === "ins") return `<span class="koda-sugg koda-sugg--ins">${t}</span>`;
      if (p.type === "del") return `<span class="koda-sugg koda-sugg--del" contenteditable="false">${t}</span>`;
      return `<span class="koda-sugg koda-sugg--eq">${t}</span>`;
    })
    .filter(Boolean)
    .join(" ");

  return html.trim();
}

