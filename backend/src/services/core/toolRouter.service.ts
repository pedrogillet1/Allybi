/**
 * Tool Router Service - Bank-Driven Pipeline Plan Selection
 *
 * This service reads tool_router.any.json and selects the appropriate
 * pipeline plan based on answer mode and event type.
 *
 * Plans define the sequence of processing steps:
 * - ingestion_plan: parse -> index
 * - no_docs_plan: compose -> render -> quality
 * - disambiguation_plan: entities -> negatives -> scope -> retrieve -> filter -> rank -> compose -> render
 * - doc_grounded_plan: entities -> negatives -> scope -> retrieve -> filter -> rank -> conflict_pairs -> compose -> render -> quality
 * - help_plan: compose -> render -> quality
 * - refusal_plan: compose -> render -> quality
 *
 * ChatGPT-like: deterministic, explainable execution with trace.
 */

import { requireBank, getBank } from './bankLoader.service';
import { AnswerMode } from './answerModeRouter.service';

// =============================================================================
// TYPES
// =============================================================================

export type ToolId =
  | 'parse'
  | 'index'
  | 'extract_entities'
  | 'apply_negatives'
  | 'resolve_scope'
  | 'retrieve'
  | 'candidate_filter'
  | 'rank'
  | 'apply_conflict_pairs'
  | 'compose_answer'
  | 'render'
  | 'quality_gates'
  | 'emit_debug';

export interface PlanStep {
  tool: ToolId;
  config?: Record<string, any>;
}

export interface ToolPlan {
  id: string;
  description: string;
  steps: PlanStep[];
}

export interface ToolRouterInput {
  answerMode: AnswerMode;
  intentId?: string;
  event?: {
    type: 'chat' | 'upload' | 'delete' | 'system';
  };
}

export interface ToolRouterResult {
  planId: string;
  plan: ToolPlan;
  matchedOverride?: string;
  stepsToExecute: ToolId[];
}

interface ToolRouterBank {
  _meta: { id: string; version: string };
  config: {
    enabled: boolean;
    limits: {
      maxStepsSoft: number;
      maxStepsHard: number;
      maxRetriesPerStep: number;
    };
    guardrails: {
      neverSkipQualityGatesInUserOutput: boolean;
      neverComposeDocAnswerIfNoDocs: boolean;
      neverClaimUnsupportedFileActions: boolean;
    };
  };
  toolIds: ToolId[];
  plans: ToolPlan[];
  routing: {
    byAnswerMode: Record<string, string>;
    overrides: Array<{
      id: string;
      priority: number;
      when: { path: string; op: string; value: any };
      usePlan: string;
    }>;
  };
}

// =============================================================================
// TOOL ROUTER SERVICE
// =============================================================================

class ToolRouterService {
  private static instance: ToolRouterService;
  private bank: ToolRouterBank | null = null;
  private plansMap: Map<string, ToolPlan> = new Map();

  private constructor() {
    this.loadBank();
  }

  static getInstance(): ToolRouterService {
    if (!ToolRouterService.instance) {
      ToolRouterService.instance = new ToolRouterService();
    }
    return ToolRouterService.instance;
  }

  private loadBank(): void {
    try {
      this.bank = requireBank<ToolRouterBank>('tool_router');
      console.log(`[ToolRouter] Loaded bank v${this.bank._meta.version}`);

      // Index plans for quick lookup
      for (const plan of this.bank.plans) {
        this.plansMap.set(plan.id, plan);
      }
    } catch (error) {
      console.warn('[ToolRouter] Failed to load bank, using default plans');
      this.bank = null;
      this.initDefaultPlans();
    }
  }

  private initDefaultPlans(): void {
    const defaultPlans: ToolPlan[] = [
      {
        id: 'ingestion_plan',
        description: 'File ingestion: parse -> index',
        steps: [{ tool: 'parse' }, { tool: 'index' }],
      },
      {
        id: 'no_docs_plan',
        description: 'No docs: render no-docs microcopy',
        steps: [{ tool: 'compose_answer' }, { tool: 'render' }, { tool: 'quality_gates' }],
      },
      {
        id: 'disambiguation_plan',
        description: 'Ambiguity: retrieve candidates -> rank -> render disambiguation question',
        steps: [
          { tool: 'extract_entities' },
          { tool: 'apply_negatives' },
          { tool: 'resolve_scope' },
          { tool: 'retrieve' },
          { tool: 'candidate_filter' },
          { tool: 'rank' },
          { tool: 'compose_answer' },
          { tool: 'render' },
        ],
      },
      {
        id: 'doc_grounded_plan',
        description: 'Standard doc-grounded answer',
        steps: [
          { tool: 'extract_entities' },
          { tool: 'apply_negatives' },
          { tool: 'resolve_scope' },
          { tool: 'retrieve' },
          { tool: 'candidate_filter' },
          { tool: 'rank' },
          { tool: 'apply_conflict_pairs' },
          { tool: 'compose_answer' },
          { tool: 'render' },
          { tool: 'quality_gates' },
        ],
      },
      {
        id: 'help_plan',
        description: 'Product help: bypass doc retrieval',
        steps: [{ tool: 'compose_answer' }, { tool: 'render' }, { tool: 'quality_gates' }],
      },
      {
        id: 'refusal_plan',
        description: 'Policy refusal: render refusal microcopy',
        steps: [{ tool: 'compose_answer' }, { tool: 'render' }, { tool: 'quality_gates' }],
      },
    ];

    for (const plan of defaultPlans) {
      this.plansMap.set(plan.id, plan);
    }
  }

  // ===========================================================================
  // MAIN API
  // ===========================================================================

  /**
   * Select the appropriate plan based on answer mode and context.
   */
  route(input: ToolRouterInput): ToolRouterResult {
    let planId: string;
    let matchedOverride: string | undefined;

    // Check overrides first (higher priority)
    if (this.bank) {
      for (const override of this.bank.routing.overrides.sort((a, b) => b.priority - a.priority)) {
        if (this.evaluateOverride(override.when, input)) {
          planId = override.usePlan;
          matchedOverride = override.id;
          break;
        }
      }
    }

    // If no override matched, use answer mode mapping
    if (!planId!) {
      planId = this.getPlanIdByAnswerMode(input.answerMode);
    }

    // Get the plan
    const plan = this.plansMap.get(planId) || this.plansMap.get('doc_grounded_plan')!;

    // Apply guardrails
    const stepsToExecute = this.applyGuardrails(plan.steps, input);

    return {
      planId: plan.id,
      plan,
      matchedOverride,
      stepsToExecute: stepsToExecute.map(s => s.tool),
    };
  }

  /**
   * Get plan by ID (for testing/debugging)
   */
  getPlan(planId: string): ToolPlan | undefined {
    return this.plansMap.get(planId);
  }

  /**
   * Get all available plans
   */
  getAllPlans(): ToolPlan[] {
    return Array.from(this.plansMap.values());
  }

  // ===========================================================================
  // INTERNAL
  // ===========================================================================

  private getPlanIdByAnswerMode(mode: AnswerMode): string {
    if (this.bank) {
      const planId = this.bank.routing.byAnswerMode[mode];
      if (planId) return planId;
    }

    // Default mapping
    const defaultMapping: Record<AnswerMode, string> = {
      no_docs: 'no_docs_plan',
      processing: 'no_docs_plan',
      extraction_failed: 'no_docs_plan',
      scope_empty: 'no_docs_plan',
      scoped_not_found: 'no_docs_plan',
      nav_pills: 'disambiguation_plan',
      refusal: 'refusal_plan',
      error: 'doc_grounded_plan',
      rank_disambiguate: 'disambiguation_plan',
      rank_autopick: 'doc_grounded_plan',
      doc_grounded_single: 'doc_grounded_plan',
      doc_grounded_multi: 'doc_grounded_plan',
      doc_grounded_quote: 'doc_grounded_plan',
      doc_grounded_table: 'doc_grounded_plan',
      general_steps: 'help_plan',
      general_answer: 'doc_grounded_plan',
      correction: 'doc_grounded_plan',
    };

    return defaultMapping[mode] || 'doc_grounded_plan';
  }

  private evaluateOverride(
    when: { path: string; op: string; value: any },
    input: ToolRouterInput
  ): boolean {
    const value = this.getValueByPath(when.path, input);

    switch (when.op) {
      case 'eq':
        return value === when.value;
      case 'in':
        return Array.isArray(when.value) && when.value.includes(value);
      default:
        return false;
    }
  }

  private getValueByPath(path: string, input: ToolRouterInput): any {
    const parts = path.split('.');
    let current: any = input;

    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }

    return current;
  }

  private applyGuardrails(steps: PlanStep[], input: ToolRouterInput): PlanStep[] {
    if (!this.bank) return steps;

    const guardrails = this.bank.config.guardrails;
    let result = [...steps];

    // Never skip quality gates for user output
    if (guardrails.neverSkipQualityGatesInUserOutput) {
      const hasQualityGates = result.some(s => s.tool === 'quality_gates');
      if (!hasQualityGates && input.event?.type === 'chat') {
        result.push({ tool: 'quality_gates' });
      }
    }

    // Limit steps
    const maxSteps = this.bank.config.limits.maxStepsHard;
    if (result.length > maxSteps) {
      console.warn(`[ToolRouter] Plan exceeds max steps (${result.length} > ${maxSteps}), truncating`);
      result = result.slice(0, maxSteps);
    }

    return result;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const toolRouter = ToolRouterService.getInstance();

export function routeToolPlan(input: ToolRouterInput): ToolRouterResult {
  return toolRouter.route(input);
}

export function getToolPlan(planId: string): ToolPlan | undefined {
  return toolRouter.getPlan(planId);
}
