import { test, expect } from '@playwright/test';

test('localhost smoke: prompt renders + Gmail connector start uses callbackUrl', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'e2e_access_token');
    localStorage.setItem('refreshToken', 'e2e_refresh_token');
    localStorage.setItem('user', JSON.stringify({ id: 'e2e-user', email: 'e2e@allybi.co' }));
  });

  // --- Backend mocks (no backend required for this smoke test) ---
  let seenGmailStartUrl: string | null = null;

  await page.route('http://localhost:5000/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'e2e-user', email: 'e2e@allybi.co' } }),
    });
  });

  await page.route('http://localhost:5000/api/integrations/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          providers: [
            { provider: 'gmail', ok: true, env: { ok: true }, status: { connected: false, expired: false } },
            { provider: 'slack', ok: true, env: { ok: true }, status: { connected: false, expired: false } },
            { provider: 'outlook', ok: true, env: { ok: false }, status: { connected: false, expired: false } },
          ],
        },
      }),
    });
  });

  await page.route('http://localhost:5000/api/integrations/gmail/start**', async (route) => {
    seenGmailStartUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          provider: 'gmail',
          authorizationUrl: 'https://example.com/oauth',
          state: 'e2e',
        },
      }),
    });
  });

  // Conversation creation (ChatInterface will create a conversation if needed).
  await page.route('http://localhost:5000/api/chat/conversations', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'e2e-convo', title: 'New Chat' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ conversations: [] }),
    });
  });

  // SSE chat stream endpoint used by ChatInterface.jsx.
  await page.route('http://localhost:5000/api/chat/stream', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
      },
      body:
        'data: {"type":"meta","answerMode":"general_answer","navType":null}\\n\\n' +
        'data: {"type":"delta","text":"Hello from e2e."}\\n\\n' +
        'data: {"type":"final","message":{"text":"Hello from e2e.","answerMode":"general_answer","sources":[],"followups":[]}}\\n\\n',
    });
  });

  // Anything else to localhost backend is a test failure (helps catch new deps).
  await page.route('http://localhost:5000/**', async (route) => {
    const url = route.request().url();
    // Allow the explicit routes above.
    if (
      url.includes('/api/auth/me') ||
      url.includes('/api/integrations/status') ||
      url.includes('/api/integrations/gmail/start') ||
      url.includes('/api/chat/stream') ||
      url.includes('/api/chat/conversations')
    ) {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 500, contentType: 'text/plain', body: `Unhandled backend request in e2e: ${url}` });
  });

  // --- UI assertions ---
  await page.goto('/');

  // Send a prompt and verify the assistant renders streamed text.
  await page.getByPlaceholder('Ask Koda…').fill('say hello');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Hello from e2e.')).toBeVisible();

  // Open connectors menu (+) and click Gmail; ensure start endpoint includes callbackUrl override in localhost.
  await page.getByRole('button', { name: 'Connectors' }).click();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Gmail' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL('https://example.com/oauth');

  expect(seenGmailStartUrl).toBeTruthy();
  expect(seenGmailStartUrl).toContain('callbackUrl=');
  // In dev we expect the callbackUrl override to be http://localhost:5000/api/integrations/gmail/callback
  expect(decodeURIComponent(seenGmailStartUrl || '')).toContain('http://localhost:5000/api/integrations/gmail/callback');
});
