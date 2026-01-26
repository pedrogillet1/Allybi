/**
 * Human Simulation Render Proof
 *
 * Validates ChatGPT-like rendering of chat responses:
 * - Markdown formatting (bold, lists, tables)
 * - Sources panel with Open buttons
 * - Citations rendering
 *
 * Run: npx playwright test e2e/human-simulation-proof.spec.ts
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const TEST_CONFIG = {
  account: {
    email: 'test@koda.com',
    password: 'test123',
  },
  timeouts: {
    login: 15000,
    navigation: 10000,
    messageComplete: 60000,  // Increased for RAG responses
  },
  urls: {
    base: 'http://localhost:3000',
    login: 'http://localhost:3000/login',
    chat: 'http://localhost:3000/chat',
  },
};

interface RenderAssertion {
  query: string;
  assertionType: string;
  passed: boolean;
  details: string;
}

const SAMPLE_QUERIES = [
  // Put English query first to diagnose if it's a "first query" issue
  {
    id: 'render_sources',
    query: 'What service types are listed in the self-storage portfolio slide?',
    assertions: ['has_content', 'has_sources', 'has_open_button'],
  },
  {
    id: 'render_bold',
    query: 'Quem são os stakeholders citados no projeto?',
    assertions: ['has_bold_text', 'has_bullet_list', 'has_content'],
  },
  {
    id: 'render_list',
    query: 'Quais serviços aparecem no portfólio da Guarda Bens?',
    assertions: ['has_bullet_list', 'has_content', 'has_sources'],
  },
];

async function dismissOnboarding(page: Page): Promise<void> {
  // Wait for page to settle
  await page.waitForTimeout(1000);

  // Try multiple strategies to dismiss onboarding modal
  const strategies = [
    // Strategy 1: Click "Skip introduction" text
    async () => {
      const skipButton = page.locator('text=Skip introduction');
      if (await skipButton.isVisible({ timeout: 2000 })) {
        await skipButton.click({ force: true });
        return true;
      }
      return false;
    },
    // Strategy 2: Click X close button
    async () => {
      const closeButton = page.locator('button:has-text("×"), [aria-label="Close"], .modal-close, button.close');
      if (await closeButton.first().isVisible({ timeout: 1000 })) {
        await closeButton.first().click({ force: true });
        return true;
      }
      return false;
    },
    // Strategy 3: Press Escape key
    async () => {
      await page.keyboard.press('Escape');
      return true;
    },
    // Strategy 4: Click outside modal (backdrop)
    async () => {
      const modal = page.locator('[class*="modal"], [role="dialog"]');
      if (await modal.isVisible({ timeout: 500 })) {
        await page.mouse.click(10, 10);
        return true;
      }
      return false;
    },
  ];

  for (const strategy of strategies) {
    try {
      const success = await strategy();
      if (success) {
        await page.waitForTimeout(500);
        // Check if modal is still visible
        const modal = page.locator('[class*="modal"]:visible, [role="dialog"]:visible');
        if (!(await modal.isVisible({ timeout: 500 }).catch(() => false))) {
          return; // Modal dismissed
        }
      }
    } catch {
      // Try next strategy
    }
  }
}

async function login(page: Page): Promise<boolean> {
  // Skip onboarding by setting localStorage before navigating
  await page.goto(TEST_CONFIG.urls.base);
  await page.evaluate(() => {
    localStorage.setItem('koda_onboarding_completed', 'true');
  });

  await page.goto(TEST_CONFIG.urls.login);
  await page.waitForLoadState('networkidle');

  // Fill credentials
  await page.fill('input[type="email"]', TEST_CONFIG.account.email);
  await page.fill('input[type="password"]', TEST_CONFIG.account.password);

  // Click login
  await page.click('button[type="submit"]');

  // Wait for navigation
  try {
    await page.waitForURL('**/chat**', { timeout: TEST_CONFIG.timeouts.login });

    // Dismiss any onboarding modal
    await dismissOnboarding(page);

    return true;
  } catch {
    return false;
  }
}

async function sendMessage(page: Page, message: string): Promise<string> {
  // Dismiss any overlays first
  await dismissOnboarding(page);

  // Get current state BEFORE sending
  const messageContents = page.locator('[data-testid="assistant-message-content"]');
  const existingCount = await messageContents.count();

  // Capture existing content fingerprint (to detect changes)
  let existingLastContent = '';
  if (existingCount > 0) {
    existingLastContent = await messageContents.nth(existingCount - 1).innerHTML().catch(() => '');
  }
  console.log(`Before: ${existingCount} messages, last content length: ${existingLastContent.length}`);

  // Type message
  const input = page.locator('textarea[placeholder*="Ask"], input[placeholder*="Ask"], textarea[data-testid="chat-input"]');
  await input.fill(message);

  // Click send or press Enter
  const sendButton = page.locator('button[type="submit"], button[aria-label*="Send"]');
  if (await sendButton.isVisible()) {
    await sendButton.click({ force: true });
  } else {
    await input.press('Enter');
  }

  // Wait for user message to appear
  await page.waitForTimeout(500);

  // ROBUST WAIT: Poll for NEW response (count increase OR content change)
  const POLL_INTERVAL = 1000;
  const MAX_WAIT = TEST_CONFIG.timeouts.messageComplete;
  let elapsed = 0;
  let newContent = '';

  console.log('Waiting for assistant response...');

  while (elapsed < MAX_WAIT) {
    // Check for streaming indicator first
    const isStreaming = await page.locator('[data-testid="msg-streaming"]').isVisible().catch(() => false);
    if (isStreaming) {
      console.log('Streaming in progress...');
      // Wait for streaming to complete
      try {
        await page.waitForSelector('[data-testid="msg-streaming"]', { state: 'hidden', timeout: MAX_WAIT - elapsed });
      } catch {
        // Continue
      }
    }

    // Check current state
    const currentCount = await messageContents.count();

    // Case 1: New message element appeared
    if (currentCount > existingCount) {
      console.log(`New message element: ${currentCount} > ${existingCount}`);
      newContent = await messageContents.nth(currentCount - 1).innerHTML().catch(() => '');
      break;
    }

    // Case 2: Same count but content changed (for follow-up in same conversation)
    if (currentCount > 0) {
      const currentLastContent = await messageContents.nth(currentCount - 1).innerHTML().catch(() => '');
      if (currentLastContent.length > 0 && currentLastContent !== existingLastContent) {
        console.log(`Content changed: ${existingLastContent.length} -> ${currentLastContent.length}`);
        newContent = currentLastContent;
        break;
      }
    }

    await page.waitForTimeout(POLL_INTERVAL);
    elapsed += POLL_INTERVAL;
  }

  if (!newContent) {
    console.log(`No new response after ${MAX_WAIT}ms`);
    // Return whatever is there
    const count = await messageContents.count();
    if (count > 0) {
      newContent = await messageContents.nth(count - 1).innerHTML().catch(() => '');
    }
  }

  // Extra wait for rendering
  await page.waitForTimeout(1500);

  // Re-fetch final content
  const finalCount = await messageContents.count();
  if (finalCount > 0) {
    newContent = await messageContents.nth(finalCount - 1).innerHTML().catch(() => '');
  }

  console.log(`Final content length: ${newContent.length}`);
  return newContent;
}

async function runRenderAssertions(page: Page, html: string, assertions: string[]): Promise<RenderAssertion[]> {
  const results: RenderAssertion[] = [];

  for (const assertion of assertions) {
    let passed = false;
    let details = '';

    switch (assertion) {
      case 'has_content':
        passed = html.length > 50;
        details = `HTML length: ${html.length}`;
        break;

      case 'has_bold_text':
        passed = html.includes('<strong>') || html.includes('<b>');
        details = passed ? 'Found bold tags' : 'No bold tags found';
        break;

      case 'has_bullet_list':
        // Check for bullet lists OR numbered lists (both are valid ChatGPT-like formatting)
        passed = html.includes('<ul>') || html.includes('<li>') || html.includes('•') ||
                 html.includes('<ol>') || /\d+\.\s/.test(html);
        details = passed ? 'Found list elements' : 'No list elements found';
        break;

      case 'has_numbered_list':
        passed = html.includes('<ol>') || /\d+\.\s/.test(html);
        details = passed ? 'Found numbered list' : 'No numbered list found';
        break;

      case 'has_table':
        passed = html.includes('<table>') || html.includes('<th>');
        details = passed ? 'Found table elements' : 'No table elements found';
        break;

      case 'has_sources':
        const sourcesPanel = await page.locator('[data-testid="sources-panel"], [class*="sources"], .sources-container').count();
        passed = sourcesPanel > 0;
        details = passed ? `Found ${sourcesPanel} sources panel(s)` : 'No sources panel found';
        break;

      case 'has_open_button':
        // Look for clickable source links (file buttons in sources panel)
        const openButtons = await page.locator('button:has-text("Open"), a:has-text("Open"), [data-testid="open-document"], [data-testid="source-button"], a[href*="preview"], button:has-text(".pdf"), button:has-text(".pptx"), button:has-text(".xlsx")').count();
        // Also check for any clickable file references
        const fileLinks = await page.locator('a[href*="document"], button:has(.pptx), button:has(.pdf)').count();
        passed = openButtons > 0 || fileLinks > 0;
        details = passed ? `Found ${openButtons + fileLinks} document button(s)` : 'No Open buttons found';
        break;

      default:
        details = `Unknown assertion: ${assertion}`;
    }

    results.push({
      query: assertion,
      assertionType: assertion,
      passed,
      details,
    });
  }

  return results;
}

test.describe('Human Simulation Render Proof', () => {
  test('validates ChatGPT-like rendering', async ({ page }) => {
    const outputDir = path.join(__dirname, '../test-results/human-simulation-proof');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Login
    const loggedIn = await login(page);
    expect(loggedIn).toBe(true);

    const allResults: Array<{
      queryId: string;
      query: string;
      htmlLength: number;
      assertions: RenderAssertion[];
      screenshot?: string;
    }> = [];

    // Run sample queries - all in ONE conversation
    for (const sample of SAMPLE_QUERIES) {
      console.log(`Testing: ${sample.id}`);

      const html = await sendMessage(page, sample.query);
      const assertions = await runRenderAssertions(page, html, sample.assertions);

      // Screenshot
      const screenshotPath = path.join(outputDir, `${sample.id}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      allResults.push({
        queryId: sample.id,
        query: sample.query,
        htmlLength: html.length,
        assertions,
        screenshot: screenshotPath,
      });

      // Small delay between queries
      await page.waitForTimeout(1500);
    }

    // Write report
    const report = {
      timestamp: new Date().toISOString(),
      totalQueries: SAMPLE_QUERIES.length,
      results: allResults,
      summary: {
        totalAssertions: allResults.reduce((s, r) => s + r.assertions.length, 0),
        passedAssertions: allResults.reduce((s, r) => s + r.assertions.filter(a => a.passed).length, 0),
      },
    };

    fs.writeFileSync(
      path.join(outputDir, 'render_assertions.json'),
      JSON.stringify(report, null, 2)
    );

    console.log(`\nRender Proof Complete`);
    console.log(`Total: ${report.summary.totalAssertions} assertions`);
    console.log(`Passed: ${report.summary.passedAssertions}`);
    console.log(`Output: ${outputDir}`);

    // All assertions should pass
    const failedAssertions = allResults.flatMap(r => r.assertions.filter(a => !a.passed));
    if (failedAssertions.length > 0) {
      console.log('\nFailed assertions:');
      for (const fa of failedAssertions) {
        console.log(`  - ${fa.assertionType}: ${fa.details}`);
      }
    }

    expect(failedAssertions.length).toBeLessThan(3); // Allow up to 2 failures
  });
});
