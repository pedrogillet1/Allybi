/**
 * Slides Master Quality Smoke Test
 *
 * End-to-end: login -> chat -> generate a deck that requests visuals.
 *
 * Defaults to the shared test credentials (override via env):
 *   E2E_EMAIL, E2E_PASSWORD, E2E_BASE_URL, E2E_BACKEND_URL
 */

import { test, expect } from '@playwright/test';
import { login } from './utils/auth';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.E2E_BACKEND_URL || 'http://localhost:5000';

async function waitForBackendReady(request: any, timeoutMs = 60000) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const resp = await request.get(`${BACKEND_URL}/health`);
      if (resp.ok()) return;
    } catch {
      // ignore
    }
    if (Date.now() - start > timeoutMs) throw new Error('Backend /health did not become ready in time');
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function sendChatAndWaitForDeck(page: any, message: string, timeoutMs = 240000) {
  const input = page.locator(
    'textarea[placeholder*="Ask Koda"], input[placeholder*="Ask Koda"], [data-testid="chat-input"]',
  );
  await input.waitFor({ state: 'visible', timeout: 30000 });
  await input.fill(message);
  await input.press('Enter');

  // Deck card renders as an attachment card with a Google Slides link button.
  const deckCard = page.locator('.koda-deck-card').first();
  await deckCard.waitFor({ state: 'visible', timeout: timeoutMs });

  const link = deckCard.locator('a[href*="docs.google.com/presentation/d/"]');
  await expect(link).toBeVisible({ timeout: 30000 });

  return {
    deckCard,
    href: await link.getAttribute('href'),
  };
}

test.describe('Slides Master Quality', () => {
  test.describe.configure({ mode: 'serial' });

  test('generates a high-design business deck with visuals requested', async ({ page, request }) => {
    await waitForBackendReady(request);

    await page.goto(`${BASE_URL}/a/x7k2m9?mode=login`, { waitUntil: 'networkidle' });
    await login(page, { baseUrl: BASE_URL });

    // Ensure we are on chat UI.
    await page.goto(`${BASE_URL}/chat`, { waitUntil: 'networkidle' }).catch(() => {});

    const prompt = [
      'Create a presentation for the Scrum Framework.',
      'Design requirements:',
      '- Captivating layout and strong typography hierarchy.',
      '- Text balance: max 6 bullets per slide, no long paragraphs.',
      '- Include visuals: hero image on the cover and 2 diagram-style slides (no text inside images).',
      '- Make it look like an agency-quality deck, not a default template.',
      'Output as a Google Slides deck.',
    ].join('\n');

    const { href } = await sendChatAndWaitForDeck(page, prompt);
    expect(href).toMatch(/docs\.google\.com\/presentation\/d\//);

    await page.screenshot({ path: 'e2e/test-results/slides-master-quality-deck-card.png', fullPage: true });
  });
});

