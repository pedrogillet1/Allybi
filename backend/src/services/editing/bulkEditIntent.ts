export type BulkEditIntent =
  | { kind: "enhance_bullets" }
  | { kind: "global_replace"; from: string; to: string }
  | { kind: "section_rewrite"; heading: string }
  | { kind: "section_bullets_to_paragraph"; heading: string }
  | null;

function extractQuotedSegments(text: string): string[] {
  const q = String(text || "");
  const segs: string[] = [];
  const rx = /"([^"\n]{2,2000})"|'([^'\n]{2,2000})'/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(q))) {
    const picked = (m[1] || m[2] || "").trim();
    if (picked) segs.push(picked);
    if (segs.length >= 3) break;
  }
  return segs;
}

function normalizeHeadingHint(raw: string): string {
  const h0 = String(raw || "").trim();
  if (!h0) return "";

  // Strip leading instruction verbs/prefixes that often appear in natural requests.
  // Ex: "edit summarize all of the AI understanding ..." -> "AI understanding ..."
  let h = h0
    .replace(/^(?:please\s+)?(?:edit|summarize|summarise|rewrite|rephrase|convert|turn|make|change|update|remove|delete)\b\s+/i, "")
    .trim();

  // Strip leading determiners / common prefixes.
  h = h.replace(/^(?:all\s+of\s+the|all\s+the|all\s+of|the|a|an)\s+/i, "").trim();

  // Common tail phrases from instructions, not headings.
  // Ex: "AI understanding section into one paragraph" -> "AI understanding"
  const tailMatchers: RegExp[] = [
    /\bsection\b[\s\S]*$/i,
    /\binto\s+(?:one|a)\s+paragraph\b[\s\S]*$/i,
    /\bin\s+(?:one|a)\s+paragraph\b[\s\S]*$/i,
    /\bas\s+(?:one|a)\s+paragraph\b[\s\S]*$/i,
    /\bto\s+(?:one|a)\s+paragraph\b[\s\S]*$/i,
    /\bparagraph\b[\s\S]*$/i,
    // PT-BR common tails
    /\bse[cç][aã]o\b[\s\S]*$/i,
    /\b(em|para)\s+um\s+par[aá]grafo\b[\s\S]*$/i,
    /\bpar[aá]grafo\b[\s\S]*$/i,
  ];

  // Only apply these trims if the string is long enough to plausibly include an instruction tail.
  if (h.split(/\s+/).length >= 4) {
    for (const rx of tailMatchers) {
      const m = h.match(rx);
      if (m && m.index != null && m.index > 0) {
        h = h.slice(0, m.index).trim();
        break;
      }
    }
  }

  // If the hint accidentally includes the word "bullet(s)" as part of the instruction, trim it off.
  const kw = h.match(/\b(?:bullet[-\s]*points?|bullets?|list|t[oó]picos|itens)\b/i)?.[0];
  if (kw) {
    const idx = h.toLowerCase().indexOf(kw.toLowerCase());
    if (idx > 2) h = h.slice(0, idx).trim();
  }

  // Trim common trailing instruction phrases even if we didn't match the full tail.
  // Ex: "AI understanding ... into one" -> "AI understanding"
  h = h
    .replace(/\binto\s+one\b[\s\S]*$/i, "")
    .replace(/\binto\b[\s\S]*$/i, (m) => (/\bparagraph\b/i.test(m) ? "" : m)) // only strip "into ..." if it includes "paragraph"
    .trim();

  // Cleanup trailing punctuation / quotes.
  h = h.replace(/^[\"']/, "").replace(/[\"']$/, "").trim();
  h = h.replace(/[.:;\-–—]+$/g, "").trim();

  // Guardrail: these are pointer words, not real heading hints.
  const low = h.toLowerCase();
  const stop = new Set([
    "selected",
    "selection",
    "this",
    "that",
    "it",
    "them",
    "these",
    "those",
    "here",
  ]);
  if (stop.has(low)) return "";
  if (/^(?:the\s+)?selected\b/i.test(h)) return "";

  return h;
}

/**
 * Detect "bulk edit" intents that are better executed as batch operators
 * rather than per-selection surgical edits.
 */
export function detectBulkEditIntent(message: string): BulkEditIntent {
  // Normalize common typos/shortcuts so intent detection remains robust.
  // Examples:
  // - "nparagraph" (user typo) -> "paragraph"
  // - "\\nparagraph" (escaped newline token) -> "paragraph"
  const q = String(message || "")
    .replace(/\bnparagraph\b/gi, "paragraph")
    .replace(/\\nparagraph/gi, "paragraph")
    .trim();
  const low = q.toLowerCase();

  const wantsBullets =
    /\b(bullet|bullets|bullet points)\b/.test(low) &&
    /\b(all|every|entire)\b/.test(low) &&
    /\b(enhance|improve|tighten|rewrite|rephrase|fix|polish)\b/.test(low);

  if (wantsBullets) return { kind: "enhance_bullets" };

  const wantsReplace = /\b(replace|change)\b/.test(low) && /\b(all|every|throughout|across)\b/.test(low);
  if (wantsReplace) {
    const segs = extractQuotedSegments(q);
    if (segs.length >= 2) {
      return { kind: "global_replace", from: segs[0]!, to: segs[1]! };
    }

    const m = q.match(/\breplace\s+(.+?)\s+\bwith\b\s+(.+?)\s*$/i);
    if (m) {
      const from = String(m[1] || "").trim();
      const to = String(m[2] || "").trim();
      if (from && to) return { kind: "global_replace", from, to };
    }
  }

  const wantsSection = /\b(section|heading|under|below)\b/.test(low) && /\b(rewrite|restructure|tighten|improve)\b/.test(low);
  if (wantsSection) {
    const segs = extractQuotedSegments(q);
    if (segs.length >= 1) {
      const heading = normalizeHeadingHint(segs[0]!);
      if (heading) return { kind: "section_rewrite", heading };
    }
    const m = q.match(/\b(?:under|below)\b\s+(.+?)\s*$/i);
    if (m && m[1]) {
      const heading = normalizeHeadingHint(String(m[1]).trim());
      if (heading) return { kind: "section_rewrite", heading };
    }
  }

  // IMPORTANT: Avoid misrouting "insert/add a paragraph below the last bullet" into
  // bullets->paragraph bulk transforms. Those are structural insertion requests.
  // Example:
  //   "add a paragraph below the last bullet point in the AI understanding section ..."
  const isInsertionBelowLastBullet =
    /\b(add|insert|append)\b/.test(low) &&
    /\bparagraph\b/.test(low) &&
    /\bbelow\b|\bafter\b/.test(low) &&
    /\blast\b/.test(low) &&
    /\b(bullet|bullets|bullet points|list)\b/.test(low);
  if (isInsertionBelowLastBullet) return null;

  // Common request: bullets -> paragraph under a given heading/section.
  const wantsBulletsToParagraph =
    (
      (/\b(bullet|bullets|bullet points)\b/.test(low) && /\b(paragraph)\b/.test(low)) ||
      (/\b(list)\b/.test(low) && /\b(paragraph)\b/.test(low)) ||
      (/\b(remove|delete)\b/.test(low) && /\b(bullet|bullets|bullet points)\b/.test(low) && /\b(paragraph)\b/.test(low)) ||
      (
        // Keep this detector explicit. "add a paragraph" is not a bullets->paragraph convert.
        /\b(convert|turn|make|summarize)\b/.test(low) &&
        /\b(bullet|bullets|bullet points|list)\b/.test(low) &&
        /\b(into|to)\b/.test(low) &&
        /\b(paragraph)\b/.test(low)
      )
    );
  if (wantsBulletsToParagraph) {
    const segs = extractQuotedSegments(q);
    if (segs.length >= 1) {
      const heading = normalizeHeadingHint(segs[0]!);
      if (heading) return { kind: "section_bullets_to_paragraph", heading };
    }

    // Strong extractor: "in the <heading> section ..."
    const inSection = q.match(/\b(?:in|within)\b\s+(?:the\s+)?(.+?)\s+\bsection\b/i);
    if (inSection?.[1]) {
      const heading = normalizeHeadingHint(inSection[1]);
      if (heading) return { kind: "section_bullets_to_paragraph", heading };
    }

    // "under <heading> ... into a paragraph"
    const m2 = q.match(/\b(?:under|below)\b\s+(.+?)\s+(?:into|to)\s+(?:a\s+)?paragraph\b/i);
    if (m2 && m2[1]) {
      const heading = normalizeHeadingHint(m2[1]);
      if (heading) return { kind: "section_bullets_to_paragraph", heading };
    }

    // "make/convert/turn/summarize <heading> bullet points into a paragraph"
    const m = q.match(/\b(?:make|convert|turn|summarize)\b\s+(.+?)\s+(?:bullet|bullets|bullet points|list)\b/i);
    if (m && m[1]) {
      const heading = normalizeHeadingHint(m[1]);
      if (heading) return { kind: "section_bullets_to_paragraph", heading };
    }

    // Last resort: if they mention "AI understanding", treat it as the heading hint.
    // Keep this conservative so we don't accidentally capture the whole instruction tail.
    const hint = q.match(/\b(ai understanding)\b/i)?.[1]?.trim();
    if (hint) {
      const heading = normalizeHeadingHint(hint);
      if (heading) return { kind: "section_bullets_to_paragraph", heading };
    }
  }

  return null;
}
