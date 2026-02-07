/**
 * Social Metrics Service
 * Tracks social media presence across platforms
 * Provides follower counts, trends, and historical data
 */

import type { PrismaClient } from '@prisma/client';
import { supportsModel } from './_shared/prismaAdapter';
import { config } from '../../config/env';

// ============================================================================
// Types
// ============================================================================

export interface SocialPresence {
  platform: string;
  followers: number;
  trend: number;       // % change vs last period
  lastUpdated: string;
}

export interface SocialHistoryPoint {
  date: string;
  platform: string;
  followers: number;
}

export interface SocialMetricsResult {
  current: SocialPresence[];
  history: SocialHistoryPoint[];
}

// Platform configuration
const PLATFORMS = ['instagram', 'youtube', 'linkedin', 'twitter', 'tiktok'] as const;
type Platform = typeof PLATFORMS[number];

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Get current social metrics and historical data
 */
export async function getSocialMetrics(
  prisma: PrismaClient
): Promise<SocialMetricsResult> {
  if (!supportsModel(prisma, 'socialSnapshot')) {
    return { current: [], history: [] };
  }

  // Get most recent snapshot for each platform
  const latestSnapshots = await Promise.all(
    PLATFORMS.map(async (platform) => {
      const latest = await prisma.socialSnapshot.findFirst({
        where: { platform },
        orderBy: { capturedAt: 'desc' },
      });
      return { platform, snapshot: latest };
    })
  );

  // Get previous period snapshots for trend calculation (7 days ago)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const previousSnapshots = await Promise.all(
    PLATFORMS.map(async (platform) => {
      const previous = await prisma.socialSnapshot.findFirst({
        where: {
          platform,
          capturedAt: { lt: weekAgo },
        },
        orderBy: { capturedAt: 'desc' },
      });
      return { platform, snapshot: previous };
    })
  );

  // Build current presence with trends
  const current: SocialPresence[] = latestSnapshots
    .filter(({ snapshot }) => snapshot !== null)
    .map(({ platform, snapshot }) => {
      const prev = previousSnapshots.find(p => p.platform === platform)?.snapshot;
      const prevFollowers = prev?.followers ?? snapshot!.followers;
      const trend = prevFollowers > 0
        ? ((snapshot!.followers - prevFollowers) / prevFollowers) * 100
        : 0;

      return {
        platform,
        followers: snapshot!.followers,
        trend: Math.round(trend * 10) / 10,
        lastUpdated: snapshot!.capturedAt.toISOString(),
      };
    });

  // Get historical data (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const historyRaw = await prisma.socialSnapshot.findMany({
    where: {
      capturedAt: { gte: thirtyDaysAgo },
    },
    orderBy: { capturedAt: 'asc' },
    select: {
      platform: true,
      followers: true,
      capturedAt: true,
    },
  });

  const history: SocialHistoryPoint[] = historyRaw.map(h => ({
    date: h.capturedAt.toISOString().split('T')[0],
    platform: h.platform,
    followers: h.followers,
  }));

  return { current, history };
}

/**
 * Record a social media snapshot
 * Called by scheduled job or manual refresh
 */
export async function recordSocialSnapshot(
  prisma: PrismaClient,
  data: {
    platform: Platform;
    followers: number;
    posts?: number;
    engagement?: number;
  }
): Promise<void> {
  if (!supportsModel(prisma, 'socialSnapshot')) {
    return;
  }

  await prisma.socialSnapshot.create({
    data: {
      platform: data.platform,
      followers: data.followers,
      posts: data.posts ?? null,
      engagement: data.engagement ?? null,
      capturedAt: new Date(),
    },
  });
}

/**
 * Batch record multiple platform snapshots
 */
export async function recordAllPlatformSnapshots(
  prisma: PrismaClient,
  snapshots: Array<{
    platform: Platform;
    followers: number;
    posts?: number;
    engagement?: number;
  }>
): Promise<void> {
  if (!supportsModel(prisma, 'socialSnapshot')) {
    return;
  }

  await prisma.socialSnapshot.createMany({
    data: snapshots.map(s => ({
      platform: s.platform,
      followers: s.followers,
      posts: s.posts ?? null,
      engagement: s.engagement ?? null,
      capturedAt: new Date(),
    })),
  });
}

// ============================================================================
// API Integration Helpers
// ============================================================================

/**
 * Fetch Instagram followers via Facebook Graph API
 * Requires Instagram Business Account linked to Facebook Page
 */
export async function fetchInstagramFollowers(accessToken: string, businessId: string): Promise<number | null> {
  try {
    const url = `https://graph.facebook.com/v18.0/${businessId}?fields=followers_count&access_token=${accessToken}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('[SocialMetrics] Instagram API error:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data.followers_count ?? null;
  } catch (err) {
    console.error('[SocialMetrics] Instagram fetch error:', err);
    return null;
  }
}

/**
 * Fetch YouTube subscribers via YouTube Data API v3
 */
export async function fetchYouTubeSubscribers(apiKey: string, channelId: string): Promise<number | null> {
  try {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('[SocialMetrics] YouTube API error:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const count = data.items?.[0]?.statistics?.subscriberCount;
    return count ? parseInt(count, 10) : null;
  } catch (err) {
    console.error('[SocialMetrics] YouTube fetch error:', err);
    return null;
  }
}

/**
 * Fetch Facebook page followers via Graph API
 */
export async function fetchFacebookFollowers(accessToken: string, pageId: string): Promise<number | null> {
  try {
    const url = `https://graph.facebook.com/v18.0/${pageId}?fields=followers_count,fan_count&access_token=${accessToken}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('[SocialMetrics] Facebook API error:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data.followers_count ?? data.fan_count ?? null;
  } catch (err) {
    console.error('[SocialMetrics] Facebook fetch error:', err);
    return null;
  }
}

/**
 * Fetch LinkedIn followers
 * Requires LinkedIn Marketing API
 */
export async function fetchLinkedInFollowers(accessToken: string, organizationId: string): Promise<number | null> {
  try {
    // LinkedIn requires Organization API access
    const url = `https://api.linkedin.com/v2/networkSizes/${organizationId}?edgeType=CompanyFollowedByMember`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      console.warn('[SocialMetrics] LinkedIn API error:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data.firstDegreeSize ?? null;
  } catch (err) {
    console.error('[SocialMetrics] LinkedIn fetch error:', err);
    return null;
  }
}

/**
 * Fetch Twitter/X followers via X API v2
 */
export async function fetchTwitterFollowers(bearerToken: string, userId: string): Promise<number | null> {
  try {
    const url = `https://api.twitter.com/2/users/${userId}?user.fields=public_metrics`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${bearerToken}` }
    });
    if (!res.ok) {
      console.warn('[SocialMetrics] Twitter API error:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data.data?.public_metrics?.followers_count ?? null;
  } catch (err) {
    console.error('[SocialMetrics] Twitter fetch error:', err);
    return null;
  }
}

/**
 * Fetch TikTok followers via TikTok Display API
 */
export async function fetchTikTokFollowers(accessToken: string): Promise<number | null> {
  try {
    const res = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=follower_count', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      console.warn('[SocialMetrics] TikTok API error:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data.data?.user?.follower_count ?? null;
  } catch (err) {
    console.error('[SocialMetrics] TikTok fetch error:', err);
    return null;
  }
}

// ============================================================================
// Platform Configuration
// ============================================================================

/**
 * Get list of platforms with valid credentials configured
 */
export function getConfiguredPlatforms(): string[] {
  const configured: string[] = [];
  if (config.INSTAGRAM_ACCESS_TOKEN && config.INSTAGRAM_BUSINESS_ID) configured.push('instagram');
  if (config.FACEBOOK_ACCESS_TOKEN && config.FACEBOOK_PAGE_ID) configured.push('facebook');
  if (config.YOUTUBE_API_KEY && config.YOUTUBE_CHANNEL_ID) configured.push('youtube');
  if (config.TIKTOK_ACCESS_TOKEN) configured.push('tiktok');
  return configured;
}

/**
 * Get all supported platforms (for UI to show configured vs not)
 */
export function getAllPlatforms(): string[] {
  return ['instagram', 'facebook', 'youtube', 'tiktok', 'twitter', 'linkedin'];
}

// Track last refresh time
let lastRefreshTime: Date | null = null;

export function getLastRefreshTime(): Date | null {
  return lastRefreshTime;
}

export function setLastRefreshTime(time: Date): void {
  lastRefreshTime = time;
}

// ============================================================================
// Scheduled Job
// ============================================================================

/**
 * Refresh all social metrics using environment config
 * Called by scheduler every 5 minutes
 */
export async function refreshAllSocialMetrics(
  prisma: PrismaClient
): Promise<{ success: string[]; failed: string[] }> {
  const success: string[] = [];
  const failed: string[] = [];

  const configuredPlatforms = getConfiguredPlatforms();
  if (configuredPlatforms.length === 0) {
    console.log('[SocialMetrics] No platforms configured, skipping refresh');
    return { success, failed };
  }

  console.log('[SocialMetrics] Refreshing:', configuredPlatforms.join(', '));

  // Instagram
  if (config.INSTAGRAM_ACCESS_TOKEN && config.INSTAGRAM_BUSINESS_ID) {
    const followers = await fetchInstagramFollowers(
      config.INSTAGRAM_ACCESS_TOKEN,
      config.INSTAGRAM_BUSINESS_ID
    );
    if (followers !== null) {
      await recordSocialSnapshot(prisma, { platform: 'instagram', followers });
      success.push('instagram');
    } else {
      failed.push('instagram');
    }
  }

  // Facebook
  if (config.FACEBOOK_ACCESS_TOKEN && config.FACEBOOK_PAGE_ID) {
    const followers = await fetchFacebookFollowers(
      config.FACEBOOK_ACCESS_TOKEN,
      config.FACEBOOK_PAGE_ID
    );
    if (followers !== null) {
      await recordSocialSnapshot(prisma, { platform: 'facebook' as Platform, followers });
      success.push('facebook');
    } else {
      failed.push('facebook');
    }
  }

  // YouTube
  if (config.YOUTUBE_API_KEY && config.YOUTUBE_CHANNEL_ID) {
    const followers = await fetchYouTubeSubscribers(
      config.YOUTUBE_API_KEY,
      config.YOUTUBE_CHANNEL_ID
    );
    if (followers !== null) {
      await recordSocialSnapshot(prisma, { platform: 'youtube', followers });
      success.push('youtube');
    } else {
      failed.push('youtube');
    }
  }

  // TikTok
  if (config.TIKTOK_ACCESS_TOKEN) {
    const followers = await fetchTikTokFollowers(config.TIKTOK_ACCESS_TOKEN);
    if (followers !== null) {
      await recordSocialSnapshot(prisma, { platform: 'tiktok', followers });
      success.push('tiktok');
    } else {
      failed.push('tiktok');
    }
  }

  setLastRefreshTime(new Date());
  console.log('[SocialMetrics] Refresh complete. Success:', success.join(', ') || 'none', '| Failed:', failed.join(', ') || 'none');

  return { success, failed };
}

/**
 * Legacy function signature for backwards compatibility
 */
export async function refreshAllSocialMetricsWithCredentials(
  prisma: PrismaClient,
  credentials: {
    instagram?: { accessToken: string; businessId: string };
    facebook?: { accessToken: string; pageId: string };
    youtube?: { apiKey: string; channelId: string };
    linkedin?: { accessToken: string; organizationId: string };
    twitter?: { bearerToken: string; userId: string };
    tiktok?: { accessToken: string };
  }
): Promise<{ success: string[]; failed: string[] }> {
  const success: string[] = [];
  const failed: string[] = [];

  // Instagram
  if (credentials.instagram) {
    const followers = await fetchInstagramFollowers(
      credentials.instagram.accessToken,
      credentials.instagram.businessId
    );
    if (followers !== null) {
      await recordSocialSnapshot(prisma, { platform: 'instagram', followers });
      success.push('instagram');
    } else {
      failed.push('instagram');
    }
  }

  // Facebook
  if (credentials.facebook) {
    const followers = await fetchFacebookFollowers(
      credentials.facebook.accessToken,
      credentials.facebook.pageId
    );
    if (followers !== null) {
      await recordSocialSnapshot(prisma, { platform: 'facebook' as Platform, followers });
      success.push('facebook');
    } else {
      failed.push('facebook');
    }
  }

  // YouTube
  if (credentials.youtube) {
    const followers = await fetchYouTubeSubscribers(
      credentials.youtube.apiKey,
      credentials.youtube.channelId
    );
    if (followers !== null) {
      await recordSocialSnapshot(prisma, { platform: 'youtube', followers });
      success.push('youtube');
    } else {
      failed.push('youtube');
    }
  }

  // LinkedIn
  if (credentials.linkedin) {
    const followers = await fetchLinkedInFollowers(
      credentials.linkedin.accessToken,
      credentials.linkedin.organizationId
    );
    if (followers !== null) {
      await recordSocialSnapshot(prisma, { platform: 'linkedin', followers });
      success.push('linkedin');
    } else {
      failed.push('linkedin');
    }
  }

  // Twitter/X
  if (credentials.twitter) {
    const followers = await fetchTwitterFollowers(
      credentials.twitter.bearerToken,
      credentials.twitter.userId
    );
    if (followers !== null) {
      await recordSocialSnapshot(prisma, { platform: 'twitter', followers });
      success.push('twitter');
    } else {
      failed.push('twitter');
    }
  }

  // TikTok
  if (credentials.tiktok) {
    const followers = await fetchTikTokFollowers(credentials.tiktok.accessToken);
    if (followers !== null) {
      await recordSocialSnapshot(prisma, { platform: 'tiktok', followers });
      success.push('tiktok');
    } else {
      failed.push('tiktok');
    }
  }

  setLastRefreshTime(new Date());
  return { success, failed };
}
