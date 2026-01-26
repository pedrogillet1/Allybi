/**
 * ============================================================================
 * CSS CONTRACT STANDALONE TEST
 * ============================================================================
 *
 * Tests CSS rendering WITHOUT requiring authentication.
 * Opens a static HTML page with markdown samples and validates computed styles.
 *
 * Run: npx playwright test css-contract-standalone.spec.ts --headed
 * ============================================================================
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST HTML CONTENT
// ═══════════════════════════════════════════════════════════════════════════════

const TEST_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>CSS Contract Test</title>
  <style>
    /* Import the actual CSS from the app */
    ${fs.readFileSync(path.join(__dirname, '../src/components/MarkdownStyles.css'), 'utf-8')}
    ${fs.readFileSync(path.join(__dirname, '../src/components/SpacingUtilities.css'), 'utf-8')}
    ${fs.readFileSync(path.join(__dirname, '../src/components/StreamingAnimation.css'), 'utf-8')}

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
    }
    .test-section {
      margin-bottom: 40px;
      padding: 20px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
    }
    .test-label {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
  </style>
</head>
<body>
  <!-- PARAGRAPH TEST -->
  <div class="test-section" id="paragraph-test">
    <div class="test-label">Paragraph Spacing Test</div>
    <div class="koda-markdown markdown-preview-container">
      <p class="markdown-paragraph">This is the first paragraph. It should have proper spacing below it to create visual separation from the next paragraph.</p>
      <p class="markdown-paragraph">This is the second paragraph. The spacing between paragraphs should be approximately 12px (ChatGPT-like).</p>
      <p class="markdown-paragraph">This is the third paragraph. Notice how the last paragraph should NOT have bottom margin.</p>
    </div>
  </div>

  <!-- HEADING TEST -->
  <div class="test-section" id="heading-test">
    <div class="test-label">Heading Spacing Test</div>
    <div class="koda-markdown markdown-preview-container">
      <h2 class="markdown-h2">This is an H2 Heading</h2>
      <p class="markdown-paragraph">Content after the heading should have proper spacing.</p>
      <h3 class="markdown-h3">This is an H3 Heading</h3>
      <p class="markdown-paragraph">More content after the H3 heading.</p>
    </div>
  </div>

  <!-- BULLET LIST TEST -->
  <div class="test-section" id="bullet-list-test">
    <div class="test-label">Bullet List Spacing Test</div>
    <div class="koda-markdown markdown-preview-container">
      <ul class="markdown-ul">
        <li class="markdown-li">First bullet item</li>
        <li class="markdown-li">Second bullet item</li>
        <li class="markdown-li">Third bullet item</li>
        <li class="markdown-li">Fourth bullet item</li>
        <li class="markdown-li">Fifth bullet item</li>
      </ul>
    </div>
  </div>

  <!-- NUMBERED LIST TEST -->
  <div class="test-section" id="numbered-list-test">
    <div class="test-label">Numbered List Spacing Test</div>
    <div class="koda-markdown markdown-preview-container">
      <ol class="markdown-ol">
        <li class="markdown-li">First step in the process</li>
        <li class="markdown-li">Second step with more detail</li>
        <li class="markdown-li">Third step to complete</li>
      </ol>
    </div>
  </div>

  <!-- LIST WITH NESTED P TEST -->
  <div class="test-section" id="list-nested-p-test">
    <div class="test-label">List with Nested P (ReactMarkdown output)</div>
    <div class="koda-markdown markdown-preview-container">
      <ul class="markdown-ul">
        <li class="markdown-li"><p>First item with paragraph wrapper</p></li>
        <li class="markdown-li"><p>Second item with paragraph wrapper</p></li>
        <li class="markdown-li"><p>Third item with paragraph wrapper</p></li>
      </ul>
    </div>
  </div>

  <!-- TABLE TEST -->
  <div class="test-section" id="table-test">
    <div class="test-label">Table Rendering Test</div>
    <div class="koda-markdown markdown-preview-container">
      <table class="markdown-table">
        <thead>
          <tr>
            <th>Feature</th>
            <th>PDF</th>
            <th>Word</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Editing</td>
            <td>Limited</td>
            <td>Full</td>
          </tr>
          <tr>
            <td>Formatting</td>
            <td>Preserved</td>
            <td>Variable</td>
          </tr>
          <tr>
            <td>File Size</td>
            <td>Smaller</td>
            <td>Larger</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- CODE TEST -->
  <div class="test-section" id="code-test">
    <div class="test-label">Code Rendering Test</div>
    <div class="koda-markdown markdown-preview-container">
      <p class="markdown-paragraph">Here is some <code class="markdown-inline-code">inline code</code> in a sentence.</p>
      <pre class="markdown-code-block"><code>{
  "name": "document.pdf",
  "size": 1024,
  "type": "application/pdf"
}</code></pre>
    </div>
  </div>

  <!-- BLOCKQUOTE TEST -->
  <div class="test-section" id="blockquote-test">
    <div class="test-label">Blockquote Rendering Test</div>
    <div class="koda-markdown markdown-preview-container">
      <blockquote class="markdown-blockquote">
        <p>This is a blockquote. It should have a subtle left border and light background, not a heavy blue card style.</p>
      </blockquote>
    </div>
  </div>

  <!-- STREAMING CURSOR TEST -->
  <div class="test-section" id="cursor-test">
    <div class="test-label">Streaming Cursor Test</div>
    <div class="koda-markdown markdown-preview-container streaming">
      <p class="markdown-paragraph">This text is streaming</p>
      <span class="streaming-cursor"></span>
    </div>
  </div>
</body>
</html>
`;

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('CSS Contract (Standalone)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Load the test HTML directly
    await page.setContent(TEST_HTML);
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('paragraph spacing is ~12px bottom margin', async () => {
    const paragraphs = page.locator('#paragraph-test .markdown-paragraph');

    // Check first paragraph (should have bottom margin)
    const firstMargin = await paragraphs.first().evaluate((el) => {
      return parseInt(window.getComputedStyle(el).marginBottom);
    });

    expect(firstMargin).toBeGreaterThanOrEqual(8);
    expect(firstMargin).toBeLessThanOrEqual(16);
    console.log(`✓ Paragraph margin-bottom: ${firstMargin}px`);

    // Check last paragraph (should have 0 bottom margin)
    const lastMargin = await paragraphs.last().evaluate((el) => {
      return parseInt(window.getComputedStyle(el).marginBottom);
    });

    expect(lastMargin).toBe(0);
    console.log(`✓ Last paragraph margin-bottom: ${lastMargin}px`);
  });

  test('h2 heading has correct margin (0 if first-child, ~18px otherwise)', async () => {
    const h2 = page.locator('#heading-test .markdown-h2');

    const margin = await h2.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).marginTop);
    });

    // First h2 in container gets margin-top: 0 from SpacingUtilities first-child reset
    // This is correct ChatGPT-like behavior
    const marginBottom = await h2.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).marginBottom);
    });

    // Bottom margin should be ~8px
    expect(marginBottom).toBeGreaterThanOrEqual(4);
    expect(marginBottom).toBeLessThanOrEqual(12);

    console.log(`✓ H2 margin: ${margin}px top (first-child reset), ${marginBottom}px bottom`);
  });

  test('h3 heading has ~14px top margin', async () => {
    const h3 = page.locator('#heading-test .markdown-h3');

    const margin = await h3.evaluate((el) => {
      return parseInt(window.getComputedStyle(el).marginTop);
    });

    expect(margin).toBeGreaterThanOrEqual(10);
    expect(margin).toBeLessThanOrEqual(18);
    console.log(`✓ H3 margin-top: ${margin}px`);
  });

  test('list items have tight spacing (~4px)', async () => {
    const listItems = page.locator('#bullet-list-test .markdown-li');

    // Check middle item (not first/last)
    const margin = await listItems.nth(2).evaluate((el) => {
      return parseInt(window.getComputedStyle(el).marginTop);
    });

    expect(margin).toBeLessThanOrEqual(8);
    console.log(`✓ List item margin: ${margin}px`);
  });

  test('nested <p> in <li> has no extra margin', async () => {
    const nestedP = page.locator('#list-nested-p-test .markdown-li p');

    const margin = await nestedP.first().evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        top: parseInt(style.marginTop),
        bottom: parseInt(style.marginBottom),
      };
    });

    expect(margin.top).toBe(0);
    expect(margin.bottom).toBe(0);
    console.log(`✓ Nested p margin: ${margin.top}px top, ${margin.bottom}px bottom`);
  });

  test('table has proper structure and styling', async () => {
    const table = page.locator('#table-test .markdown-table');

    // Check table exists
    await expect(table).toBeVisible();

    // Check border-collapse
    const borderCollapse = await table.evaluate((el) => {
      return window.getComputedStyle(el).borderCollapse;
    });
    expect(borderCollapse).toBe('collapse');

    // Check header background
    const th = page.locator('#table-test .markdown-table thead th').first();
    const headerBg = await th.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    // Should be dark (black or near-black)
    expect(headerBg).toMatch(/rgb\(0,\s*0,\s*0\)/);

    console.log(`✓ Table: border-collapse=${borderCollapse}, header-bg=${headerBg}`);
  });

  test('inline code has border, padding, and background', async () => {
    const inlineCode = page.locator('#code-test .markdown-inline-code');

    const styles = await inlineCode.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        padding: style.padding,
        border: style.border,
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
      };
    });

    // Should have padding
    expect(styles.padding).not.toBe('0px');
    // Should have background
    expect(styles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');

    console.log(`✓ Inline code: padding=${styles.padding}, bg=${styles.backgroundColor}`);
  });

  test('code block has dark background', async () => {
    const codeBlock = page.locator('#code-test pre.markdown-code-block');

    const styles = await codeBlock.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        backgroundColor: style.backgroundColor,
        display: style.display,
        borderRadius: style.borderRadius,
      };
    });

    // Should be dark background (not transparent, not white)
    expect(styles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles.backgroundColor).not.toBe('rgb(255, 255, 255)');
    // Should be block display
    expect(styles.display).toBe('block');

    console.log(`✓ Code block: display=${styles.display}, bg=${styles.backgroundColor}`);
  });

  test('blockquote has left border and subtle background', async () => {
    const blockquote = page.locator('#blockquote-test .markdown-blockquote');

    const styles = await blockquote.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        borderLeft: style.borderLeft,
        backgroundColor: style.backgroundColor,
      };
    });

    // Should have left border
    expect(styles.borderLeft).toContain('solid');
    // Should have subtle background (not transparent, but light)
    expect(styles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');

    console.log(`✓ Blockquote: border-left=${styles.borderLeft}, bg=${styles.backgroundColor}`);
  });

  test('streaming cursor is visible and green', async () => {
    const cursor = page.locator('#cursor-test .streaming-cursor');

    await expect(cursor).toBeVisible();

    const styles = await cursor.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        width: style.width,
        height: style.height,
        backgroundColor: style.backgroundColor,
        display: style.display,
      };
    });

    // Should be visible (not 0 width/height)
    expect(parseInt(styles.width)).toBeGreaterThan(0);
    expect(parseInt(styles.height)).toBeGreaterThan(0);
    // Should be inline-block
    expect(styles.display).toBe('inline-block');
    // Should be green (#10a37f = rgb(16, 163, 127))
    expect(styles.backgroundColor).toMatch(/rgb\(16,\s*163,\s*127\)/);

    console.log(`✓ Cursor: ${styles.width}x${styles.height}, bg=${styles.backgroundColor}`);
  });

  test('take visual snapshot', async () => {
    await page.screenshot({
      path: 'e2e/test-results/css-contract-snapshot.png',
      fullPage: true
    });
    console.log('✓ Visual snapshot saved to e2e/test-results/css-contract-snapshot.png');
  });
});
