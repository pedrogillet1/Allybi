/**
 * ActionHistoryService
 *
 * Manages undo state for file actions.
 * Records action history, retrieves undo-able actions, and executes undo operations.
 *
 * 100% databank-driven - reads undo TTL and descriptions from file_action_operators.any.json.
 */

import prisma from '../../../config/database';
import { getOptionalBank } from '../banks/bankLoader.service';
import type { FileActionOperatorsBank } from '../extraction/entityExtractor.service';

export type LanguageCode = 'en' | 'pt' | 'es';

export interface UndoHistoryEntry {
  userId: string;
  operator: string;
  previousState: Record<string, any>;
  entityIds: Record<string, string>;
}

export interface UndoResult {
  success: boolean;
  undoDescription?: string;
  error?: string;
}

export class ActionHistoryService {
  private bank: FileActionOperatorsBank | null = null;
  private undoTtlSeconds: number = 300; // Default 5 minutes

  constructor() {
    this.loadBank();
  }

  private loadBank(): void {
    this.bank = getOptionalBank<FileActionOperatorsBank>('file_action_operators');
    if (this.bank?.config?.undoTtlSeconds) {
      this.undoTtlSeconds = this.bank.config.undoTtlSeconds;
    }
  }

  /**
   * Record an action for potential undo.
   */
  async record(entry: UndoHistoryEntry): Promise<string> {
    const expiresAt = new Date(Date.now() + this.undoTtlSeconds * 1000);

    const record = await prisma.actionHistory.create({
      data: {
        userId: entry.userId,
        operator: entry.operator,
        previousState: entry.previousState,
        entityIds: entry.entityIds,
        expiresAt,
        canUndo: true,
      },
    });

    return record.id;
  }

  /**
   * Get the last undo-able action for a user.
   */
  async getLastUndoable(userId: string): Promise<{
    id: string;
    operator: string;
    previousState: Record<string, any>;
    entityIds: Record<string, string>;
  } | null> {
    const action = await prisma.actionHistory.findFirst({
      where: {
        userId,
        canUndo: true,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!action) return null;

    return {
      id: action.id,
      operator: action.operator,
      previousState: action.previousState as Record<string, any>,
      entityIds: action.entityIds as Record<string, string>,
    };
  }

  /**
   * Mark an action as no longer undo-able.
   */
  async markUsed(actionId: string): Promise<void> {
    await prisma.actionHistory.update({
      where: { id: actionId },
      data: { canUndo: false },
    });
  }

  /**
   * Get the undo description for an operator.
   */
  getUndoDescription(
    operator: string,
    entities: Record<string, string>,
    language: LanguageCode
  ): string {
    if (!this.bank) return '';

    const undoOp = this.bank.operators.undo;
    if (!undoOp?.undoDescriptions?.[operator]) {
      return `reverted ${operator}`;
    }

    const template = undoOp.undoDescriptions[operator][language] ||
                     undoOp.undoDescriptions[operator].en ||
                     `reverted ${operator}`;

    return this.interpolate(template, entities);
  }

  /**
   * Get microcopy for undo results.
   */
  getMicrocopy(key: string, language: LanguageCode): string {
    if (!this.bank) return '';

    const undoOp = this.bank.operators.undo;
    if (!undoOp?.microcopy?.[key]) return '';

    return undoOp.microcopy[key][language] || undoOp.microcopy[key].en || '';
  }

  /**
   * Clean up expired action history entries.
   * Call this periodically (e.g., in a cron job).
   */
  async cleanupExpired(): Promise<number> {
    const result = await prisma.actionHistory.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { canUndo: false },
        ],
      },
    });

    return result.count;
  }

  /**
   * Interpolate template string with entity values.
   */
  private interpolate(template: string, values: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => values[key] || `{${key}}`);
  }
}

// Singleton instance
let instance: ActionHistoryService | null = null;

export function getActionHistoryService(): ActionHistoryService {
  if (!instance) {
    instance = new ActionHistoryService();
  }
  return instance;
}
