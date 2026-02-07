/**
 * Acquisition Service
 * Tracks user acquisition sources for marketing analytics
 */

import type { PrismaClient } from '@prisma/client';
import { supportsModel } from './_shared/prismaAdapter';

// ============================================================================
// Types
// ============================================================================

export interface AcquisitionSource {
  source: string;
  count: number;
  percentage: number;
}

export interface AcquisitionTrend {
  date: string;
  source: string;
  count: number;
}

export interface TopCampaign {
  campaign: string;
  source: string;
  users: number;
  conversionRate: number;
}

export interface AcquisitionMetrics {
  sources: AcquisitionSource[];
  trends: AcquisitionTrend[];
  topCampaigns: TopCampaign[];
  totalUsers: number;
  topSource: string;
  organicRate: number;
}

export interface CaptureAcquisitionParams {
  userId: string;
  source: string;
  campaign?: string;
  medium?: string;
  referrerUrl?: string;
  landingPage?: string;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Get acquisition metrics for the dashboard
 */
export async function getAcquisitionMetrics(
  prisma: PrismaClient,
  params: { range?: string }
): Promise<AcquisitionMetrics> {
  if (!supportsModel(prisma, 'userAcquisition')) {
    return {
      sources: [],
      trends: [],
      topCampaigns: [],
      totalUsers: 0,
      topSource: 'unknown',
      organicRate: 0,
    };
  }

  const { range = '30d' } = params;

  // Calculate date range
  const now = new Date();
  let startDate: Date;
  switch (range) {
    case '24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  // Get acquisition data grouped by source
  const acquisitions = await prisma.userAcquisition.findMany({
    where: {
      createdAt: { gte: startDate },
    },
    orderBy: { createdAt: 'asc' },
  });

  const totalUsers = acquisitions.length;

  // Group by source
  const sourceMap = new Map<string, number>();
  acquisitions.forEach((a) => {
    sourceMap.set(a.source, (sourceMap.get(a.source) || 0) + 1);
  });

  const sources: AcquisitionSource[] = Array.from(sourceMap.entries())
    .map(([source, count]) => ({
      source,
      count,
      percentage: totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Group by date and source for trends
  const trendMap = new Map<string, Map<string, number>>();
  acquisitions.forEach((a) => {
    const date = a.createdAt.toISOString().split('T')[0];
    if (!trendMap.has(date)) {
      trendMap.set(date, new Map());
    }
    const dateMap = trendMap.get(date)!;
    dateMap.set(a.source, (dateMap.get(a.source) || 0) + 1);
  });

  const trends: AcquisitionTrend[] = [];
  trendMap.forEach((sourceCounts, date) => {
    sourceCounts.forEach((count, source) => {
      trends.push({ date, source, count });
    });
  });
  trends.sort((a, b) => a.date.localeCompare(b.date));

  // Top campaigns
  const campaignMap = new Map<string, { source: string; count: number }>();
  acquisitions.forEach((a) => {
    if (a.campaign) {
      const key = a.campaign;
      if (!campaignMap.has(key)) {
        campaignMap.set(key, { source: a.source, count: 0 });
      }
      campaignMap.get(key)!.count++;
    }
  });

  const topCampaigns: TopCampaign[] = Array.from(campaignMap.entries())
    .map(([campaign, data]) => ({
      campaign,
      source: data.source,
      users: data.count,
      conversionRate: totalUsers > 0 ? Math.round((data.count / totalUsers) * 100) : 0,
    }))
    .sort((a, b) => b.users - a.users)
    .slice(0, 10);

  // Calculate organic rate
  const organicCount = (sourceMap.get('organic') || 0) + (sourceMap.get('direct') || 0);
  const organicRate = totalUsers > 0 ? Math.round((organicCount / totalUsers) * 100) : 0;

  return {
    sources,
    trends,
    topCampaigns,
    totalUsers,
    topSource: sources[0]?.source || 'unknown',
    organicRate,
  };
}

/**
 * Record a user's acquisition source
 * Called during user registration
 */
export async function captureAcquisition(
  prisma: PrismaClient,
  params: CaptureAcquisitionParams
): Promise<void> {
  if (!supportsModel(prisma, 'userAcquisition')) {
    return;
  }

  const { userId, source, campaign, medium, referrerUrl, landingPage } = params;

  try {
    await prisma.userAcquisition.upsert({
      where: { userId },
      update: {}, // Don't update if already exists
      create: {
        userId,
        source: source || 'direct',
        campaign: campaign || null,
        medium: medium || null,
        referrerUrl: referrerUrl || null,
        landingPage: landingPage || null,
      },
    });
  } catch (err) {
    console.error('[Acquisition] Failed to capture acquisition:', err);
  }
}

/**
 * Parse UTM parameters from URL
 */
export function parseAcquisitionFromUrl(url: string): Partial<CaptureAcquisitionParams> {
  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;

    return {
      source: params.get('utm_source') || undefined,
      campaign: params.get('utm_campaign') || undefined,
      medium: params.get('utm_medium') || undefined,
      landingPage: parsed.pathname,
    };
  } catch {
    return {};
  }
}

/**
 * Detect source from referrer URL
 */
export function detectSourceFromReferrer(referrer: string): string {
  if (!referrer) return 'direct';

  const lower = referrer.toLowerCase();

  if (lower.includes('google.')) return 'google';
  if (lower.includes('facebook.') || lower.includes('fb.')) return 'facebook';
  if (lower.includes('instagram.')) return 'instagram';
  if (lower.includes('youtube.') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('tiktok.')) return 'tiktok';
  if (lower.includes('twitter.') || lower.includes('t.co') || lower.includes('x.com')) return 'twitter';
  if (lower.includes('linkedin.')) return 'linkedin';
  if (lower.includes('reddit.')) return 'reddit';

  return 'organic';
}
