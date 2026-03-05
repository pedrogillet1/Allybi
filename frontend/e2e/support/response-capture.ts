import { Locator } from "@playwright/test";

const SOURCE_SELECTOR = ".koda-source-pill__text";
const ALT_SOURCE_SELECTOR = ".koda-source-pill, .source-pill, [class*='source']";

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

async function readSanitizedMessageText(lastMsg: Locator): Promise<string> {
  return lastMsg.evaluate((rootNode) => {
    const root = rootNode as HTMLElement;
    const copy = root.cloneNode(true) as HTMLElement;
    const stripSelectors = [
      ".koda-source-pill",
      ".koda-source-pill__text",
      ".source-pill",
      ".suggested-questions",
      ".chat-message-actions",
      "button",
    ];
    for (const sel of stripSelectors) {
      copy.querySelectorAll(sel).forEach((el) => el.remove());
    }
    return (copy.innerText || "").trim();
  });
}

export async function collectSourceLabels(lastMsg: Locator): Promise<string[]> {
  const labels: string[] = [];
  const sourcePills = lastMsg.locator(SOURCE_SELECTOR);
  const pillCount = await sourcePills.count();
  for (let i = 0; i < pillCount; i += 1) {
    const text = await sourcePills.nth(i).textContent();
    if (text) labels.push(text.trim());
  }
  if (labels.length === 0) {
    const altPills = lastMsg.locator(ALT_SOURCE_SELECTOR);
    const altCount = await altPills.count();
    for (let i = 0; i < altCount; i += 1) {
      const text = await altPills.nth(i).evaluate((el) => el.innerText);
      if (text && text.trim()) labels.push(text.trim());
    }
  }
  return dedupeStrings(labels);
}

export async function captureAssistantMessage(
  lastMsg: Locator,
  preferredText: string | null = null,
  preferredSources: string[] = [],
): Promise<{ responseText: string; sources: string[] }> {
  let responseText = String(preferredText || "").trim();
  if (!responseText) {
    const markdownEl = lastMsg.locator(".markdown-preview-container");
    if (await markdownEl.isVisible({ timeout: 3000 }).catch(() => false)) {
      responseText = await markdownEl.evaluate((el) => el.innerText);
      responseText = String(responseText || "").trim();
    }
  }
  if (!responseText) {
    responseText = await readSanitizedMessageText(lastMsg);
  }

  const sources =
    Array.isArray(preferredSources) && preferredSources.length > 0
      ? dedupeStrings(preferredSources)
      : await collectSourceLabels(lastMsg);

  return {
    responseText: String(responseText || "").trim(),
    sources,
  };
}
