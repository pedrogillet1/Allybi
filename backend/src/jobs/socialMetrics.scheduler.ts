/**
 * Social Metrics Scheduler
 * Automatically refreshes social media follower counts from configured platforms
 * Runs every 5 minutes when platforms are configured
 */

import cron from 'node-cron';
import prisma from '../config/database';
import {
  refreshAllSocialMetrics,
  getConfiguredPlatforms,
  getLastRefreshTime,
} from '../services/admin/socialMetrics.service';

/**
 * Run a single refresh of social metrics
 */
export async function refreshSocialMetrics(): Promise<void> {
  const platforms = getConfiguredPlatforms();

  if (platforms.length === 0) {
    // No platforms configured, skip silently
    return;
  }

  console.log(`[SocialMetrics] Starting scheduled refresh for ${platforms.length} platform(s)...`);

  try {
    const result = await refreshAllSocialMetrics(prisma);

    if (result.success.length > 0 || result.failed.length > 0) {
      console.log(`[SocialMetrics] Refresh complete. Success: ${result.success.length}, Failed: ${result.failed.length}`);
    }
  } catch (err) {
    console.error('[SocialMetrics] Scheduled refresh error:', err);
  }
}

/**
 * Initialize the social metrics scheduler
 * - Runs every 5 minutes to fetch latest follower counts
 * - Initial run after 5 seconds to populate data on startup
 */
export function startSocialMetricsScheduler(): void {
  const platforms = getConfiguredPlatforms();

  if (platforms.length === 0) {
    console.log('[SocialMetrics] No platforms configured - scheduler inactive');
    console.log('   Configure INSTAGRAM_*, FACEBOOK_*, YOUTUBE_*, or TIKTOK_* env vars to enable');
    return;
  }

  console.log(`[SocialMetrics] Scheduler started for platforms: ${platforms.join(', ')}`);

  // Schedule refresh every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await refreshSocialMetrics();
  });

  // Initial run after 5 seconds to populate data on startup
  setTimeout(async () => {
    console.log('[SocialMetrics] Running initial refresh...');
    await refreshSocialMetrics();
  }, 5000);
}

// Re-export for convenience
export { getConfiguredPlatforms, getLastRefreshTime };
