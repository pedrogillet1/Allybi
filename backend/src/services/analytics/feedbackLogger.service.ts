/**
 * Feedback Logger Service - MVP Implementation
 *
 * Logs positive/negative feedback from users for answer quality.
 * MVP: Console logging with database storage
 */

import prisma from '../../config/database';

export interface FeedbackEntry {
  userId: string;
  conversationId: string;
  messageId?: string;
  rating: 'positive' | 'negative';
  reason?: string;
  timestamp: Date;
}

export class FeedbackLoggerService {
  private feedbackLog: FeedbackEntry[] = [];

  /**
   * Log positive feedback
   */
  async logPositive(
    userId: string,
    conversationId: string,
    messageId?: string,
    reason?: string
  ): Promise<void> {
    const entry: FeedbackEntry = {
      userId,
      conversationId,
      messageId,
      rating: 'positive',
      reason,
      timestamp: new Date(),
    };

    this.feedbackLog.push(entry);
    console.log('[FeedbackLogger] Positive feedback:', { conversationId, reason });

    // MVP: Just log, database persistence can be added later
  }

  /**
   * Log negative feedback
   */
  async logNegative(
    userId: string,
    conversationId: string,
    messageId?: string,
    reason?: string
  ): Promise<void> {
    const entry: FeedbackEntry = {
      userId,
      conversationId,
      messageId,
      rating: 'negative',
      reason,
      timestamp: new Date(),
    };

    this.feedbackLog.push(entry);
    console.log('[FeedbackLogger] Negative feedback:', { conversationId, reason });
  }

  /**
   * Get feedback stats for a conversation
   */
  getStats(conversationId: string): { positive: number; negative: number } {
    const entries = this.feedbackLog.filter(e => e.conversationId === conversationId);
    return {
      positive: entries.filter(e => e.rating === 'positive').length,
      negative: entries.filter(e => e.rating === 'negative').length,
    };
  }
}

// Singleton removed - use container.getFeedbackLogger() instead
export default FeedbackLoggerService;
