import { DeckPlanSchema, type DeckPlan } from './deckPlan.types';

type ChatRole = 'system' | 'user' | 'assistant';

export interface DeckPlannerEngine {
  generate(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    messages: Array<{ role: ChatRole; content: string }>;
  }): Promise<{ text: string }>;
}

function extractFirstJsonObject(text: string): string | null {
  const s = String(text || '');
  const start = s.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function coercePlan(plan: DeckPlan, slideCountTarget: number): DeckPlan {
  const slides = [...plan.slides]
    .map((s, i) => ({ ...s, index: i + 1 }))
    .slice(0, Math.max(1, Math.min(slideCountTarget, 24)));
  return { title: plan.title, slides };
}

export class DeckPlannerService {
  constructor(private readonly engine: DeckPlannerEngine) {}

  private splitBulletToCard(line: string): { title: string; body: string } {
    const raw = String(line || '')
      .replace(/\r/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^\s*[-•]\s+/, '')
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      .trim();
    if (!raw) return { title: 'Key point', body: '' };

    const colonIdx = raw.indexOf(':');
    if (colonIdx > 0 && colonIdx < 60) {
      const left = raw.slice(0, colonIdx).trim();
      const right = raw.slice(colonIdx + 1).trim();
      if (left && right) return { title: left, body: right };
    }

    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length <= 6) return { title: raw, body: '' };
    const title = words.slice(0, 5).join(' ').trim();
    const body = words.slice(5).join(' ').trim();
    return { title, body };
  }

  private applyBlocksFromBullets(plan: DeckPlan, style: 'business' | 'legal' | 'stats' | 'medical' | 'book' | 'script'): DeckPlan {
    const slides = plan.slides.map((s) => ({ ...s })) as any[];
    const slideCount = slides.length;
    const enableIcons =
      style === 'business' ||
      style === 'book' ||
      style === 'script' ||
      // Allow dense visuals in conservative domains only when explicitly forced via env.
      process.env.KODA_SLIDES_VISUALS_FORCE === 'true';

    for (const slide of slides) {
      if (slide.blocks && Array.isArray(slide.blocks) && slide.blocks.length > 0) continue;
      if (slide.layout === 'TITLE' || slide.layout === 'SECTION_HEADER') continue;

      const bullets: string[] = Array.isArray(slide.bullets) ? slide.bullets : [];
      const subtitle = String(slide.subtitle || '').trim();

      // Heuristic: derive structured blocks from bullets to unlock premium archetypes.
      // This is intentionally conservative: only act when we have enough list structure.
      const cleaned = bullets.map((b) =>
        String(b || '')
          .replace(/\r/g, '')
          .replace(/\s+/g, ' ')
          .replace(/^\s*[-•]\s+/, '')
          // Avoid truncation artifacts (LLMs copy these into final slide copy).
          .replace(/…/g, '')
          .replace(/\.{3,}/g, '')
          .replace(/\*\*/g, '')
          .replace(/__/g, '')
          .trim(),
      );

      // Table detection: lines like "Col A | Col B | Col C"
      // If present, prefer a table archetype instead of cards/grids.
      const pipeRows = cleaned
        .map((line) => line.split('|').map((p) => p.trim()).filter(Boolean))
        .filter((parts) => parts.length === 3);
      if (pipeRows.length >= 3) {
        slide.layout = 'TITLE_AND_BODY';
        slide.blocks = [
          {
            type: 'table_4x3',
            headers: pipeRows[0].slice(0, 3),
            rows: pipeRows.slice(1, 4).map((r) => r.slice(0, 3)),
          },
        ];
        // Keep bullets as a fallback for templates that don't expose table slot tags.
      }

      if (slide.blocks && Array.isArray(slide.blocks) && slide.blocks.length > 0) {
        // If we just created a table, skip the remaining bullet-to-block conversions.
        // (Other conversions would overwrite the table block.)
        // eslint-disable-next-line no-continue
        continue;
      }

      // KPI detection (chart-heavy but editable): look for 4 metric lines.
      // Patterns supported:
      // - "ARR: $2.4M (+18%)"
      // - "Gross Margin | 62% | +4pp"
      // - "Users  128,400  +12%" (multiple spaces treated as separators)
      const kpiLines = cleaned
        .map((line) => line.replace(/\s{2,}/g, '\t').trim())
        .filter(Boolean)
        .slice(0, 6);

      const parsedKpis: Array<{ label: string; value: string; delta?: string }> = [];
      for (const line of kpiLines) {
        // Prefer pipe/tab separated.
        const parts = line.split(/[\t|]/g).map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2 && parts.length <= 3) {
          const label = parts[0];
          const value = parts[1];
          const delta = parts[2];
          if (label && value && label.length <= 80 && value.length <= 24) {
            parsedKpis.push({ label, value, delta: delta && delta.length <= 18 ? delta : undefined });
            continue;
          }
        }

        // Colon + optional "(delta)" tail
        const m = line.match(/^(.{2,80}?)\s*:\s*([^\(\)]{1,24})\s*(?:\(([^)]+)\))?\s*$/);
        if (m) {
          const label = (m[1] || '').trim();
          const value = (m[2] || '').trim();
          const delta = (m[3] || '').trim();
          if (label && value) {
            parsedKpis.push({ label, value, delta: delta ? delta.slice(0, 18) : undefined });
            continue;
          }
        }

        // Loose: "Label  VALUE  DELTA"
        const m2 = line.match(/^(.{2,80}?)\t([^\t]{1,24})(?:\t([^\t]{1,18}))?\s*$/);
        if (m2) {
          const label = (m2[1] || '').trim();
          const value = (m2[2] || '').trim();
          const delta = (m2[3] || '').trim();
          if (label && value) {
            parsedKpis.push({ label, value, delta: delta ? delta.slice(0, 18) : undefined });
          }
        }
      }

      if (parsedKpis.length >= 4) {
        slide.layout = 'TITLE_AND_BODY';
        slide.blocks = [
          {
            type: 'kpi_grid_4',
            items: parsedKpis.slice(0, 4).map((k) => ({
              label: k.label,
              value: k.value,
              delta: k.delta,
              iconPrompt: enableIcons
                ? `Minimal agency-style icon representing KPI: ${k.label}. No text. Duotone. Transparent background.`
                : undefined,
            })),
          },
        ];
        // Keep bullets as a fallback for templates that don't expose KPI slot tags.
        // eslint-disable-next-line no-continue
        continue;
      }

      if (bullets.length === 5) {
        slide.layout = 'TITLE_AND_BODY';
        slide.blocks = [
          {
            type: 'values_5',
            items: bullets.slice(0, 5).map((b: string, i: number) => {
              const card = this.splitBulletToCard(b);
              const title = card.title || `Value ${i + 1}`;
              const body = card.body || '';
              return {
                title,
                body,
                iconPrompt: enableIcons ? `Minimal agency-style icon representing: ${title}. No text. Duotone. Transparent background.` : undefined,
              };
            }),
          },
        ];
      } else if (bullets.length === 4) {
        slide.layout = 'TITLE_AND_BODY';
        slide.blocks = [
          {
            type: 'grid_2x2',
            items: bullets.slice(0, 4).map((b: string, i: number) => {
              const card = this.splitBulletToCard(b);
              const title = card.title || `Point ${i + 1}`;
              const body = card.body || '';
              return {
                title,
                body,
                iconPrompt: enableIcons ? `Minimal agency-style icon representing: ${title}. No text. Duotone. Transparent background.` : undefined,
              };
            }),
          },
        ];
      } else if (bullets.length === 3) {
        slide.layout = 'TITLE_AND_BODY';
        slide.blocks = [
          {
            type: 'triptych_pillars',
            items: bullets.slice(0, 3).map((b: string, i: number) => {
              const card = this.splitBulletToCard(b);
              const title = card.title || `Pillar ${i + 1}`;
              const body = card.body || '';
              return {
                number: String(i + 1).padStart(2, '0'),
                title,
                body,
              };
            }),
          },
        ];
      } else if (bullets.length >= 2) {
        // Default: vertical cards from bullets (2–5 items)
        const take = Math.min(4, Math.max(2, bullets.length));
        slide.layout = 'TITLE_AND_BODY';
        slide.blocks = [
          {
            type: 'cards_vertical',
            items: bullets.slice(0, take).map((b: string, i: number) => {
              const card = this.splitBulletToCard(b);
              const title = card.title || `Point ${i + 1}`;
              const body = card.body || '';
              return {
                title,
                body,
                iconPrompt: enableIcons ? `Minimal agency-style icon representing: ${title}. No text. Duotone. Transparent background.` : undefined,
              };
            }),
            note: subtitle && subtitle.length <= 180 ? subtitle : undefined,
          },
        ];
      } else if (subtitle && subtitle.length > 120) {
        // Paragraph-ish subtitle: break into 2–3 cards by sentences.
        const sentences = subtitle
          .split(/(?<=[.!?])\s+/)
          .map((t) => t.trim())
          .filter(Boolean);
        if (sentences.length >= 2) {
          slide.layout = 'TITLE_AND_BODY';
          slide.blocks = [
            {
              type: 'cards_vertical',
              items: sentences.slice(0, 3).map((t, i) => ({
                title: `Key Idea ${i + 1}`,
                body: t,
                iconPrompt: enableIcons ? `Minimal agency-style icon representing key idea ${i + 1} for slide: ${slide.title}. No text. Transparent background.` : undefined,
              })),
            },
          ];
          // Keep subtitle empty so it doesn't double-render in some templates.
          slide.subtitle = undefined;
        }
      }

      // Last slide: if empty, convert to a clean closing CTA.
      if (slide.index === slideCount && (!slide.blocks || slide.blocks.length === 0) && slide.layout !== 'TITLE') {
        slide.layout = 'TITLE_ONLY';
        slide.subtitle = slide.subtitle || 'Next steps';
      }
    }

    return { ...plan, slides } as any;
  }

  private applyLayoutStructure(plan: DeckPlan, style: 'business' | 'legal' | 'stats' | 'medical' | 'book' | 'script'): DeckPlan {
    if (style !== 'business') return plan;
    const slides = plan.slides.map((s) => ({ ...s }));
    const n = slides.length;
    if (n <= 1) return plan;

    // Ensure a designed "rhythm" so decks don't look like the same slide repeated.
    // We only adjust layouts; we keep titles and try to preserve subtitle/bullets sensibly.
    const ensureSectionHeaderAt = (idx1: number) => {
      const i = idx1 - 1;
      if (i < 1 || i >= n) return;
      const s = slides[i];
      if (s.layout === 'SECTION_HEADER') return;
      slides[i] = {
        ...s,
        layout: 'SECTION_HEADER',
        subtitle: s.subtitle || (s.bullets && s.bullets[0]) || '',
        bullets: undefined,
      } as any;
    };

    const ensureTwoColumnsAt = (idx1: number) => {
      const i = idx1 - 1;
      if (i < 1 || i >= n) return;
      const s = slides[i];
      if (s.layout === 'TITLE_AND_TWO_COLUMNS') return;
      const bullets = s.bullets && s.bullets.length ? s.bullets : (s.subtitle ? [s.subtitle] : undefined);
      slides[i] = {
        ...s,
        layout: 'TITLE_AND_TWO_COLUMNS',
        subtitle: undefined,
        bullets,
      } as any;
    };

    const ensureSectionDescAt = (idx1: number) => {
      const i = idx1 - 1;
      if (i < 1 || i >= n) return;
      const s = slides[i];
      if (s.layout === 'SECTION_TITLE_AND_DESCRIPTION') return;
      slides[i] = {
        ...s,
        layout: 'SECTION_TITLE_AND_DESCRIPTION',
        subtitle: undefined,
      } as any;
    };

    // Only apply when deck is long enough to benefit.
    if (n >= 6) {
      ensureSectionHeaderAt(2);
      ensureTwoColumnsAt(4);
      ensureSectionDescAt(6);
    } else if (n >= 4) {
      ensureSectionHeaderAt(2);
      ensureTwoColumnsAt(4);
    } else {
      ensureSectionHeaderAt(2);
    }

    // Ensure the cover is a title slide.
    slides[0] = { ...slides[0], layout: 'TITLE' } as any;

    return { ...plan, slides };
  }

  private applyDefaultVisualPolicy(plan: DeckPlan, style: 'business' | 'legal' | 'stats' | 'medical' | 'book' | 'script'): DeckPlan {
    // Only matter when visuals are enabled; safe no-op otherwise.
    if (process.env.KODA_SLIDES_ENABLE_VISUALS !== 'true') return plan;
    const force = process.env.KODA_SLIDES_VISUALS_FORCE === 'true';

    const slides = plan.slides.map((s) => {
      if (s.visual && s.visual.kind && s.visual.kind !== 'none') return s;

      // Business: strong visual identity across the deck.
      if (style === 'business') {
        if (s.layout === 'TITLE') return { ...s, visual: { kind: 'hero' } as any };
        if (s.layout === 'SECTION_HEADER') return { ...s, visual: { kind: 'backdrop' } as any };
        if (s.layout === 'TITLE_ONLY') return { ...s, visual: { kind: 'hero' } as any };
        // Everything else: diagram/icon style visuals by default.
        return { ...s, visual: { kind: 'diagram' } as any };
      }

      // Stats: diagrams only (no decorative hero photos).
      if (style === 'stats') {
        if (s.layout === 'TITLE') return { ...s, visual: { kind: 'diagram' } as any };
        if (s.layout === 'SECTION_HEADER') return { ...s, visual: { kind: 'backdrop' } as any };
        return { ...s, visual: { kind: 'diagram' } as any };
      }

      // Book: subtle backdrops.
      if (style === 'book') {
        if (s.layout === 'TITLE') return { ...s, visual: { kind: 'hero' } as any };
        if (s.layout === 'SECTION_HEADER') return { ...s, visual: { kind: 'backdrop' } as any };
        // Keep it clean but still visual on every slide.
        if (s.layout === 'TITLE_ONLY') return { ...s, visual: { kind: 'backdrop' } as any };
        return { ...s, visual: { kind: 'backdrop' } as any };
      }

      // Default: conservative unless forced.
      if (!force) return s;

      // Forced visuals for other domains:
      if (style === 'legal') {
        if (s.layout === 'TITLE') return { ...s, visual: { kind: 'backdrop' } as any };
        if (s.layout === 'SECTION_HEADER') return { ...s, visual: { kind: 'backdrop' } as any };
        if (s.layout === 'TITLE_ONLY') return { ...s, visual: { kind: 'backdrop' } as any };
        return { ...s, visual: { kind: 'diagram' } as any };
      }

      if (style === 'medical') {
        if (s.layout === 'TITLE') return { ...s, visual: { kind: 'diagram' } as any };
        if (s.layout === 'SECTION_HEADER') return { ...s, visual: { kind: 'backdrop' } as any };
        return { ...s, visual: { kind: 'diagram' } as any };
      }

      if (style === 'script') {
        if (s.layout === 'TITLE') return { ...s, visual: { kind: 'hero' } as any };
        if (s.layout === 'SECTION_HEADER') return { ...s, visual: { kind: 'backdrop' } as any };
        return { ...s, visual: { kind: 'backdrop' } as any };
      }

      return s;
    });

    return { ...plan, slides };
  }

  private enforceBudgets(plan: DeckPlan, style: 'business' | 'legal' | 'stats' | 'medical' | 'book' | 'script'): DeckPlan {
    const maxTitleWords =
      style === 'legal' ? 14 :
      style === 'medical' ? 12 :
      style === 'stats' ? 10 :
      style === 'script' ? 12 :
      style === 'book' ? 12 :
      10;

    const maxBullets =
      style === 'legal' ? 10 :
      style === 'stats' ? 5 :
      style === 'medical' ? 7 :
      style === 'book' ? 7 :
      style === 'script' ? 7 :
      6;

    const maxWordsPerBullet =
      style === 'legal' ? 18 :
      style === 'stats' ? 9 :
      style === 'medical' ? 14 :
      style === 'book' ? 14 :
      style === 'script' ? 14 :
      12;

    const maxBodyWords =
      style === 'legal' ? 170 :
      style === 'medical' ? 120 :
      style === 'book' ? 110 :
      style === 'script' ? 120 :
      style === 'stats' ? 70 :
      85;

    const normalizeWhitespace = (s: string) =>
      String(s || '').replace(/\r/g, '').replace(/\s+/g, ' ').trim();

    const splitIntoSentences = (s: string): string[] =>
      normalizeWhitespace(s)
        .split(/(?<=[.!?;])\s+/)
        .map((t) => t.trim())
        .filter(Boolean);

    const chunkWords = (s: string, maxWords: number): string[] => {
      const words = normalizeWhitespace(s).split(/\s+/).filter(Boolean);
      if (words.length <= maxWords) return [words.join(' ').trim()].filter(Boolean);
      const out: string[] = [];
      for (let i = 0; i < words.length; i += maxWords) {
        out.push(words.slice(i, i + maxWords).join(' ').trim());
      }
      return out.filter(Boolean);
    };

    // Convert one (possibly long) bullet into multiple slide-safe bullets without truncating.
    const explodeBullet = (b: string): string[] => {
      const raw = normalizeWhitespace(b).replace(/^\s*[-•]\s+/, '').trim();
      if (!raw) return [];
      const sentences = splitIntoSentences(raw);
      // If there are no sentence boundaries, chunk by words.
      if (sentences.length <= 1) return chunkWords(raw, maxWordsPerBullet);

      // Pack sentences into bullets up to maxWordsPerBullet.
      const packed: string[] = [];
      let cur: string[] = [];
      let curWords = 0;
      for (const s of sentences) {
        const w = normalizeWhitespace(s).split(/\s+/).filter(Boolean).length;
        if (w > maxWordsPerBullet) {
          // Flush current and chunk this long sentence.
          if (cur.length) packed.push(cur.join(' ').trim());
          cur = [];
          curWords = 0;
          packed.push(...chunkWords(s, maxWordsPerBullet));
          continue;
        }
        if (curWords + w > maxWordsPerBullet && cur.length) {
          packed.push(cur.join(' ').trim());
          cur = [s];
          curWords = w;
          continue;
        }
        cur.push(s);
        curWords += w;
      }
      if (cur.length) packed.push(cur.join(' ').trim());
      return packed.filter(Boolean);
    };

    // Build a new slide list because we may insert continuation slides to preserve content.
    const out: any[] = [];
    const softMaxExtraSlides = 6; // guardrail; beyond this, overflow goes to speaker notes
    let added = 0;

    for (const slide of plan.slides) {
      const next: any = { ...slide };

      // Title: keep scan-friendly, but do not append ellipses.
      const titleWords = normalizeWhitespace(next.title).split(/\s+/).filter(Boolean);
      if (titleWords.length > maxTitleWords) {
        next.title = titleWords.slice(0, maxTitleWords).join(' ').trim();
      } else {
        next.title = normalizeWhitespace(next.title);
      }

      // If subtitle is paragraph-like, prefer moving it into bullets (preserve content on-slide).
      if (next.subtitle) {
        const subtitle = normalizeWhitespace(next.subtitle);
        const subtitleWords = subtitle.split(/\s+/).filter(Boolean);
        if (subtitleWords.length > Math.min(90, maxBodyWords) || subtitle.length > 260) {
          const extraBullets = splitIntoSentences(subtitle);
          const baseBullets = Array.isArray(next.bullets) ? next.bullets : [];
          next.bullets = [...baseBullets, ...extraBullets];
          next.subtitle = undefined;
        } else {
          next.subtitle = subtitle;
        }
      }

      // Bullets: explode long bullets; never truncate with "…".
      let bullets: string[] = Array.isArray(next.bullets) ? next.bullets : [];
      bullets = bullets.flatMap((b) => explodeBullet(String(b || '')));
      bullets = bullets.map((b) => normalizeWhitespace(b)).filter(Boolean);

      // Stats decks: keep slide minimal; move overflow into speaker notes, but do not truncate.
      if (style === 'stats' && bullets.length > 0) {
        const combinedWords = bullets.join(' ').split(/\s+/).filter(Boolean).length;
        if (combinedWords > maxBodyWords || bullets.length > maxBullets) {
          const keep = bullets.slice(0, Math.min(maxBullets, 4));
          const overflow = bullets.slice(keep.length);
          if (overflow.length) {
            next.speakerNotes = [
              next.speakerNotes ? String(next.speakerNotes).trim() : '',
              'Overflow (auto-moved):',
              overflow.join('\n'),
            ].filter(Boolean).join('\n');
          }
          bullets = keep;
        }
      }

      // General overflow: if too many bullets for the layout, create continuation slide(s).
      const continuationSlides: any[] = [];
      if (bullets.length > maxBullets) {
        const first = bullets.slice(0, maxBullets);
        let rest = bullets.slice(maxBullets);
        bullets = first;

        while (rest.length && added < softMaxExtraSlides) {
          added += 1;
          const chunk = rest.slice(0, maxBullets);
          rest = rest.slice(maxBullets);
          continuationSlides.push({
            ...next,
            // keep layout consistent; continuation slides should not be section headers.
            layout: 'TITLE_AND_BODY',
            title: `${next.title} (cont.)`,
            subtitle: undefined,
            bullets: chunk,
            speakerNotes: [
              next.speakerNotes ? String(next.speakerNotes).trim() : '',
              `Continued bullets from slide ${slide.index || ''}`.trim(),
            ].filter(Boolean).join('\n'),
          });
        }

        if (rest.length) {
          next.speakerNotes = [
            next.speakerNotes ? String(next.speakerNotes).trim() : '',
            'Overflow (auto-moved):',
            rest.join('\n'),
          ].filter(Boolean).join('\n');
        }
      }

      next.bullets = bullets.length ? bullets : next.bullets;

      // If legal/medical content is dense, bias toward two-column layouts for readability.
      if ((style === 'legal' || style === 'medical') && next.layout === 'TITLE_AND_BODY') {
        const bulletCount = Array.isArray(next.bullets) ? next.bullets.length : 0;
        const subtitleWords = (String(next.subtitle || '')).split(/\s+/).filter(Boolean).length;
        const triggerBullets = style === 'medical' ? 5 : 6;
        const triggerSubtitle = style === 'medical' ? 60 : 80;
        if (bulletCount >= triggerBullets || subtitleWords >= triggerSubtitle) {
          next.layout = 'TITLE_AND_TWO_COLUMNS';
        }
      }

      // Safety: ensure slide not empty (system requirement).
      const hasContent =
        Boolean(String(next.subtitle || '').trim()) ||
        (Array.isArray(next.bullets) && next.bullets.some((b: string) => String(b || '').trim())) ||
        (Array.isArray((next as any).blocks) && (next as any).blocks.length > 0);
      if (!hasContent) {
        next.bullets = ['Key point'];
      }

      out.push(next, ...continuationSlides);
    }

    // Re-index after insertion.
    const slides = out.map((s, i) => ({ ...s, index: i + 1 }));
    return { ...plan, slides } as any;
  }

  async plan(params: {
    traceId: string;
    userId: string;
    conversationId: string;
    userRequest: string;
    sourceText?: string | null;
    slideCountTarget: number;
    language: 'en' | 'pt' | 'es';
    style?: 'business' | 'legal' | 'stats' | 'medical' | 'book' | 'script';
  }): Promise<DeckPlan> {
    const slideCountTarget = Math.max(1, Math.min(params.slideCountTarget, 24));
    const style = params.style || 'business';

    const system = [
      'You are Allybi, an expert slide designer and deck planner.',
      'Return ONLY valid JSON (no markdown).',
      'The JSON schema:',
      '{',
      '  "style"?: "business"|"legal"|"stats"|"medical"|"book"|"script",',
      '  "title": string,',
      '  "slides": [',
      '    {',
      '      "index": number (1-based),',
      '      "layout": "TITLE"|"TITLE_AND_BODY"|"TITLE_AND_TWO_COLUMNS"|"TITLE_ONLY"|"SECTION_HEADER"|"SECTION_TITLE_AND_DESCRIPTION",',
      '      "title": string,',
      '      "subtitle"?: string,',
      '      "bullets"?: string[],',
      '      "speakerNotes"?: string,',
      '      "visual"?: { "kind": "none"|"hero"|"backdrop"|"diagram", "prompt"?: string }',
      '    }',
      '  ]',
      '}',
      '',
      `Requirements:`,
      `- Produce exactly ${slideCountTarget} slides unless the user clearly requests another count.`,
      `- Deck style mode is "${style}".`,
      style === 'legal'
        ? '- Legal mode: allow more text, but structure it. Prefer TITLE_AND_TWO_COLUMNS for dense content; use speakerNotes for overflow.'
        : style === 'stats'
          ? '- Stats mode: minimal prose. Prefer a single insight headline + 3-5 bullets max. Use "diagram" visuals when useful.'
          : style === 'medical'
            ? '- Medical mode: structured, precise, and conservative. Prefer diagrams for study design, endpoints, and mechanisms.'
            : style === 'book'
              ? '- Book mode: editorial narrative. Use pull-quote style language and clear chapter/section structure.'
              : style === 'script'
                ? '- Script mode: scene/beat structure. Prefer concise beats and use speakerNotes for dialogue excerpts.'
                : '- Business mode: keep slides scannable. Prefer visuals on cover/section headers and limit bullets.',
      '- Keep text concise and slide-appropriate.',
      '- Do not leave any slide empty: each slide must include at least one of subtitle, bullets, or blocks (in addition to title).',
      '- Use a mix of formats across the deck: short paragraphs, bullet lists, and structured blocks where appropriate.',
      '- If the user asks for minimalist/black-and-white, set visual.kind="none" unless a visual is explicitly requested.',
      '- Prefer "TITLE" for slide 1, "TITLE_AND_BODY" for most content slides, and "TITLE_ONLY" for closing if appropriate.',
      style === 'business'
        ? '- Business defaults: slide 1 should usually have visual.kind="hero"; section headers should use visual.kind="backdrop" when appropriate.'
        : style === 'stats'
          ? '- Stats defaults: avoid decorative imagery; prefer diagram/backdrop only when it reinforces comprehension.'
          : style === 'medical'
            ? '- Medical defaults: visuals should be diagrammatic and clean; avoid flashy gradients unless requested.'
            : style === 'book'
              ? '- Book defaults: cover can be hero/backdrop; internal slides may use subtle backdrop.'
              : style === 'script'
                ? '- Script defaults: visuals are optional; prioritize beat clarity.'
                : '- Legal defaults: visuals are optional and should be minimal unless explicitly requested.',
    ].join('\n');

    const user = [
      `User request (${params.language}): ${params.userRequest}`,
      params.sourceText ? `\nSource material (extract):\n${params.sourceText.slice(0, 8000)}` : '',
    ].join('\n');

    const out = await this.engine.generate({
      traceId: params.traceId,
      userId: params.userId,
      conversationId: params.conversationId,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const raw = out?.text || '';
    const jsonStr = extractFirstJsonObject(raw) ?? raw.trim();
    const parsed = JSON.parse(jsonStr);
    const plan = DeckPlanSchema.parse(parsed);
    const coerced = coercePlan(plan, slideCountTarget);
    const resolvedStyle = (coerced.style as any) || style;
    const withStructure = this.applyLayoutStructure(coerced, resolvedStyle);
    const withDefaults = this.applyDefaultVisualPolicy(withStructure, resolvedStyle);
    const budgeted = this.enforceBudgets(withDefaults, resolvedStyle);
    return this.applyBlocksFromBullets(budgeted, resolvedStyle);
  }
}

export default DeckPlannerService;
