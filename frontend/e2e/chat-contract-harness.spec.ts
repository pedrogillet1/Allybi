import { test, expect } from '@playwright/test';

test.describe('Chat Contract Harness', () => {
  test('nav_pills fixture hides sources label and renders pills', async ({ page }) => {
    await page.goto('/dev/chat-harness');

    const fixture = page.locator('[data-testid="fixture-fix_nav_pills"]');
    await expect(fixture).toBeVisible();

    const sourcesRow = fixture.locator('[data-testid="sources-row"]');
    await expect(sourcesRow).toBeVisible();
    await expect(sourcesRow.locator('.koda-sources-label')).toHaveCount(0);
    await expect(sourcesRow.locator('.koda-source-pill')).toHaveCount(1);
  });

  test('streaming fixture preserves code blocks and never renders source pills inside table cells', async ({ page }) => {
    await page.goto('/dev/chat-harness');

    const fixture = page.locator('[data-testid="fixture-fix_stream_contract"]');
    await expect(fixture).toBeVisible();

    await expect(fixture.locator('pre code')).toHaveCount(1);
    await expect(fixture.locator('table td')).toContainText('Q4_report.pdf');
    await expect(fixture.locator('table td .koda-source-pill, table td [data-testid="source-pill"]')).toHaveCount(0);
    await expect(fixture.locator('[data-testid="sources-row"] .koda-source-pill')).toHaveCount(1);
  });
});
