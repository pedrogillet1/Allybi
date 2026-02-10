/**
 * Authentication Utility - Handles login for E2E tests
 */

import { Page, expect } from '@playwright/test';

export interface AuthConfig {
  email: string;
  password: string;
  baseUrl: string;
}

const DEFAULT_CONFIG: AuthConfig = {
  email: process.env.E2E_EMAIL || 'test@koda.com',
  password: process.env.E2E_PASSWORD || 'test123',
  baseUrl: process.env.E2E_BASE_URL || 'http://localhost:3000'
};

/**
 * Login to Koda with retry support
 */
export async function login(page: Page, config: Partial<AuthConfig> = {}): Promise<boolean> {
  const { email, password, baseUrl } = { ...DEFAULT_CONFIG, ...config };

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Auth] Login attempt ${attempt}/${maxRetries}...`);

      // Navigate to login page
      // Prefer the app's obfuscated auth route; fall back to /login if it exists.
      // (Some environments don't mount /login.)
      const authUrl = `${baseUrl}/a/x7k2m9?mode=login`;
      await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 30000 });
      const emailProbe = await page.locator('input[type="email"], input[name="email"]').first().isVisible({ timeout: 3000 }).catch(() => false);
      if (!emailProbe) {
        await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 30000 });
      }

      // Wait for login form
      await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });

      // Fill email
      const emailInput = page.locator('input[type="email"], input[name="email"]').first();
      await emailInput.fill(email);

      // Fill password
      const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
      await passwordInput.fill(password);

      // Click submit — avoid matching the chat send button (which has type="submit")
      const submitButton = page.locator('button:has-text("Sign In"), button:has-text("Log In"), button:has-text("Login"), button:has-text("Sign in")').first();
      await submitButton.click();

      // Wait for login to complete.
      // The auth form is often a modal overlay (no URL change), so wait for either:
      //  1) URL navigation to chat/dashboard
      //  2) The login modal to disappear (password field hidden)
      await Promise.race([
        page.waitForURL('**/c/**', { timeout: 15000 }),
        page.waitForURL('**/chat**', { timeout: 15000 }),
        page.waitForURL('**/dashboard**', { timeout: 15000 }),
        page.locator('input[type="password"]').waitFor({ state: 'hidden', timeout: 15000 }),
      ]).catch(() => {});

      // Small grace period for the UI to settle after modal closes
      await page.waitForTimeout(1000);

      // Verify we're logged in by checking for chat input or user menu
      const chatInputVisible = await page.locator('[data-chat-input], [data-testid="chat-input"]').first().isVisible({ timeout: 5000 }).catch(() => false);
      const userMenuVisible = await page.locator('[data-testid="user-menu"], [class*="avatar"], [class*="user"]').first().isVisible({ timeout: 5000 }).catch(() => false);

      if (chatInputVisible || userMenuVisible) {
        console.log(`[Auth] Login successful on attempt ${attempt}`);
        return true;
      }

      // Check for error messages
      const errorMessage = await page.locator('[class*="error"], [role="alert"], .text-red').first().textContent({ timeout: 2000 }).catch(() => null);
      if (errorMessage) {
        console.warn(`[Auth] Login error: ${errorMessage}`);
      }

      throw new Error('Could not verify login success');
    } catch (error) {
      lastError = error as Error;
      console.warn(`[Auth] Attempt ${attempt} failed:`, lastError.message);

      if (attempt < maxRetries) {
        // Wait before retry
        await page.waitForTimeout(2000);
      }
    }
  }

  console.error(`[Auth] All ${maxRetries} login attempts failed`);
  throw lastError || new Error('Login failed after all retries');
}

/**
 * Check if currently logged in
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    const chatInput = await page.locator('[data-chat-input], [data-testid="chat-input"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    return chatInput;
  } catch {
    return false;
  }
}

/**
 * Logout if logged in
 */
export async function logout(page: Page): Promise<void> {
  const loggedIn = await isLoggedIn(page);
  if (!loggedIn) return;

  // Try to find and click logout button
  const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Sign out"), [data-testid="logout"]');
  if (await logoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await logoutButton.click();
    await page.waitForURL('**/login**', { timeout: 5000 }).catch(() => {});
  }
}
