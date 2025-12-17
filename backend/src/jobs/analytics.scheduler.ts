/**
 * Analytics Scheduler
 *
 * PURPOSE: Run scheduled analytics aggregation jobs
 * RUNS: Daily at midnight (00:00) to aggregate previous day's data
 */

import cron from 'node-cron';
import { analyticsTrackingService } from '../services/analyticsEngine.service';

let isRunning = false;

/**
 * Daily Analytics Aggregation Job
 * Aggregates metrics from the previous day into the DailyAnalyticsAggregate table
 */
const runDailyAggregation = async () => {
  if (isRunning) {
    console.log('📊 [ANALYTICS SCHEDULER] Daily aggregation already running, skipping...');
    return;
  }

  isRunning = true;
  console.log('📊 [ANALYTICS SCHEDULER] Starting daily analytics aggregation...');

  try {
    // Aggregate yesterday's data
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await analyticsTrackingService.aggregateDailyAnalytics(yesterday);

    // Also run for today (partial data)
    await analyticsTrackingService.aggregateDailyAnalytics(new Date());

    console.log('✅ [ANALYTICS SCHEDULER] Daily aggregation completed successfully');
  } catch (error) {
    console.error('❌ [ANALYTICS SCHEDULER] Daily aggregation failed:', error);
  } finally {
    isRunning = false;
  }
};

/**
 * Start the analytics scheduler
 * Runs daily at midnight (00:00)
 */
export const startAnalyticsScheduler = () => {
  console.log('📊 [ANALYTICS SCHEDULER] Starting analytics scheduler...');

  // Run daily at midnight
  cron.schedule('0 0 * * *', runDailyAggregation, {
    timezone: 'UTC'
  });

  // Also run every 6 hours to keep today's data updated
  cron.schedule('0 */6 * * *', async () => {
    console.log('📊 [ANALYTICS SCHEDULER] Running 6-hourly update...');
    try {
      await analyticsTrackingService.aggregateDailyAnalytics(new Date());
      console.log('✅ [ANALYTICS SCHEDULER] 6-hourly update completed');
    } catch (error) {
      console.error('❌ [ANALYTICS SCHEDULER] 6-hourly update failed:', error);
    }
  }, {
    timezone: 'UTC'
  });

  console.log('✅ [ANALYTICS SCHEDULER] Analytics scheduler started');
  console.log('   - Daily aggregation: 00:00 UTC');
  console.log('   - 6-hourly updates: Every 6 hours UTC');

  // Run initial aggregation on startup (async, don't block)
  setTimeout(() => {
    console.log('📊 [ANALYTICS SCHEDULER] Running initial aggregation...');
    runDailyAggregation().catch(err => {
      console.error('❌ [ANALYTICS SCHEDULER] Initial aggregation failed:', err);
    });
  }, 5000); // Wait 5 seconds after startup
};

/**
 * Manual trigger for analytics aggregation
 */
export const triggerAnalyticsAggregation = async (date?: Date) => {
  return analyticsTrackingService.aggregateDailyAnalytics(date || new Date());
};

export default {
  startAnalyticsScheduler,
  triggerAnalyticsAggregation
};
