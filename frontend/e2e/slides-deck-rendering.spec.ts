import { test, expect } from '@playwright/test';

test.describe('Slides Deck Rendering (Dev Harness)', () => {
  test('renders slides_deck attachment (open link + thumbnails)', async ({ page }) => {
    // This test avoids auth/SSE flakiness by using a dev-only harness route that renders
    // a fixture deck with data: thumbnails.
    await page.goto('/dev/slides-deck-harness', { waitUntil: 'networkidle' });

    const deckCard = page.locator('.koda-deck-card').first();
    await expect(deckCard).toBeVisible();

    await expect(deckCard.locator('.koda-deck-card__title')).toContainText('Allybi');
    await expect(deckCard.locator('a.koda-deck-card__btn')).toHaveAttribute(
      'href',
      /docs\.google\.com\/presentation\/d\/TEST_PRESENTATION_ID\/edit/
    );

    // Thumbnails render.
    const thumbs = deckCard.locator('.koda-deck-card__thumb img');
    await expect(thumbs).toHaveCount(6);

    await page.screenshot({ path: 'e2e/test-results/slides-deck-rendering.png', fullPage: true });
  });
});
