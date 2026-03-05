// src/services/config/intentConfig.service.ts
//
// IntentConfigService
// -------------------
// Purpose: Load + enforce intent configuration from data banks, and provide
// a single, stable "intent decision policy" to the orchestrator.
//
// ChatGPT-parity goals:
// - Intent stability on follow-ups (don't flip intents/operators unless strong evidence).
// - Safe defaults (never throw, never return "error answers" from config layer).
// - Explicit user signals override (explicit doc ref, nav query, discovery query).
// - Environment-aware strictness (prod vs dev).
//
// This service DOES NOT do retrieval or answer generation.
// It only supplies rules + a deterministic stabilization step that the orchestrator can use.
//
// WIRING NOTES:
// 1. Call decide() after you have router candidates + followup signals.
// 2. Persist decision.persistable into state each turn:
//    state.lastRoutingDecision = decision.persistable;
// 3. Ensure signals.isFollowup and signals.followupConfidence come from your
//    followup_detection.any.json runtime.
//
// That's the piece that makes "follow-ups keep the same intent/operator unless
// the user clearly switches," which is exactly what ChatGPT-parity aims for.

import { getOptionalBank } from "../core/banks/bankLoader.service";

// -----------------------------
// Types
// -----------------------------

export type EnvName = "production" | "staging" | "dev" | "local";
export type LanguageCode = "en" | "pt" | "es";

export interface RouterCandidate {
  intentId: string; // e.g., "documents", "file_actions", "help"
  operatorId?: string; // e.g., "extract", "open", "locate_docs"
  intentFamily?: string; // optional if router already emits
  domainId?: string; // optional
  score: number; // 0..1
  reasons?: string[];
}

export interface IntentSignals {
  isFollowup?: boolean;
  followupConfidence?: number; // 0..1
  followupSource?: "context" | "followup_indicators" | "intent_patterns" | "none";
  followupReasonCodes?: string[];
  hasExplicitDocRef?: boolean;
  discoveryQuery?: boolean;
  navQuery?: boolean;
  userRequestedShort?: boolean;
  userRequestedDetailed?: boolean;
  userSaidPickForMe?: boolean;
}

export interface IntentStateSnapshot {
  lastRoutingDecision?: {
    intentId?: string;
    operatorId?: string;
    intentFamily?: string;
    domainId?: string;
    confidence?: number;
  };
  activeDocRef?: {
    docId?: string;
    filename?: string;
    lockType?: "hard" | "soft" | "none";
  };
  activeDomain?: string;
}

export interface IntentDecisionInput {
  env: EnvName;
  language: LanguageCode;
  queryText: string;
  candidates: RouterCandidate[]; // from router/rank
  signals?: IntentSignals;
  state?: IntentStateSnapshot;
}

export interface IntentDecisionOutput {
  intentId: string;
  intentFamily: string;
  operatorId: string;
  domainId: string;
  confidence: number;
  decisionNotes: string[];
  requiresClarification?: boolean;
  clarifyReason?: string;
  // if the orchestrator wants to persist:
  persistable: {
    intentId: string;
    operatorId: string;
    intentFamily: string;
    domainId: string;
    confidence: number;
  };
}

// -----------------------------
// Bank Shape
// -----------------------------

interface IntentConfigBank {
  _meta: { id: string; version: string };
  config: {
    enabled: boolean;

    // Core thresholds
    thresholds: {
      minEmitScore: number; // minimum candidate score to be considered at all
      autopickScoreGte: number; // allow autopick
      autopickMarginGte: number; // top must beat #2 by this margin
      forceClarifyTopBelow: number; // if top score below, ask clarification instead of autopick
      ambiguousMarginLt: number; // if margin < this, prefer disambiguation
    };

    // Follow-up stability rules
    followupStability: {
      enabled: boolean;
      stickyMinFollowupConfidence: number; // if followupConfidence >= this, prefer staying on prior intent
      switchRequiresScoreGte: number; // require this to switch on followup
      switchRequiresImprovementGte: number; // require improvement over previous confidence
      allowSwitchIfExplicitDocRef: boolean; // explicit doc ref can override stickiness
      allowSwitchIfDiscoveryQuery: boolean; // discovery query can override stickiness
      allowSwitchIfNavQuery: boolean; // nav query can override stickiness
    };

    // Env behavior
    env: Record<
      EnvName,
      { strictness: "high" | "medium"; failClosed: boolean }
    >;

    defaults: {
      defaultIntentId: string; // e.g. "documents"
      defaultIntentFamily: string; // e.g. "documents"
      defaultOperatorId: string; // e.g. "extract"
      defaultDomainId: string; // e.g. "general"
      defaultConfidence: number; // e.g. 0.55
    };

    operatorOverrides: {
      // hard overrides by signals (ChatGPT-like)
      discoveryQueryOperator: string; // "locate_docs"
      navQueryOperator: string; // "open" (or "locate_file")
    };

    // Optional: mappings to keep families consistent
    intentFamilies?: Record<
      string,
      {
        id: string;
        defaultOperator: string;
        allowedOperators?: string[];
      }
    >;

    // Optional: per-intent overrides
    intents?: Record<
      string,
      {
        id: string;
        family: string;
        defaultOperator?: string;
        preferredOperators?: string[];
      }
    >;
  };

  tests?: any;
}

// -----------------------------
// Fallback Config (safe defaults)
// -----------------------------

const FALLBACK_BANK: IntentConfigBank = {
  _meta: { id: "intent_config", version: "fallback" },
  config: {
    enabled: true,
    thresholds: {
      minEmitScore: 0.45,
      autopickScoreGte: 0.7,
      autopickMarginGte: 0.05,
      forceClarifyTopBelow: 0.4,
      ambiguousMarginLt: 0.03,
    },
    followupStability: {
      enabled: true,
      stickyMinFollowupConfidence: 0.62,
      switchRequiresScoreGte: 0.78,
      switchRequiresImprovementGte: 0.18,
      allowSwitchIfExplicitDocRef: true,
      allowSwitchIfDiscoveryQuery: true,
      allowSwitchIfNavQuery: true,
    },
    env: {
      production: { strictness: "high", failClosed: true },
      staging: { strictness: "high", failClosed: true },
      dev: { strictness: "medium", failClosed: false },
      local: { strictness: "medium", failClosed: false },
    },
    defaults: {
      defaultIntentId: "documents",
      defaultIntentFamily: "documents",
      defaultOperatorId: "extract",
      defaultDomainId: "general",
      defaultConfidence: 0.55,
    },
    operatorOverrides: {
      discoveryQueryOperator: "locate_docs",
      navQueryOperator: "open",
    },
    intentFamilies: {
      documents: { id: "documents", defaultOperator: "extract" },
      file_actions: { id: "file_actions", defaultOperator: "list" },
      help: { id: "help", defaultOperator: "capabilities" },
    },
    intents: {
      documents: {
        id: "documents",
        family: "documents",
        defaultOperator: "extract",
      },
      file_actions: {
        id: "file_actions",
        family: "file_actions",
        defaultOperator: "list",
      },
      help: { id: "help", family: "help", defaultOperator: "capabilities" },
    },
  },
};

// -----------------------------
// Service
// -----------------------------

export class IntentConfigService {
  private cache: IntentConfigBank | null = null;
  private loadedAtMs = 0;
  private cacheEnv: EnvName | null = null;

  // If you want hot reload in dev/local, lower this.
  private readonly CACHE_TTL_MS = 5_000;

  private normalizeEnvName(raw: string): EnvName {
    const env = String(raw || "").toLowerCase().trim();
    if (env === "production") return "production";
    if (env === "staging") return "staging";
    if (env === "development" || env === "dev") return "dev";
    return "local";
  }

  private resolveEffectiveEnv(inputEnv?: EnvName): EnvName {
    if (
      inputEnv === "production" ||
      inputEnv === "staging" ||
      inputEnv === "dev" ||
      inputEnv === "local"
    ) {
      return inputEnv;
    }
    return this.normalizeEnvName(String(process.env.NODE_ENV || ""));
  }

  private isStrictEnv(inputEnv?: EnvName): boolean {
    const env = this.resolveEffectiveEnv(inputEnv);
    return env === "production" || env === "staging";
  }

  getConfig(inputEnv?: EnvName): IntentConfigBank {
    const env = this.resolveEffectiveEnv(inputEnv);
    const now = Date.now();
    if (
      this.cache &&
      this.cacheEnv === env &&
      now - this.loadedAtMs < this.CACHE_TTL_MS
    ) {
      return this.cache;
    }

    const bank = getOptionalBank<IntentConfigBank>("intent_config");
    if (!bank) {
      if (this.isStrictEnv(env)) {
        throw new Error(
          "intent_config bank is required in strict runtime environments.",
        );
      }
      this.cache = FALLBACK_BANK;
      this.cacheEnv = env;
      this.loadedAtMs = now;
      return this.cache;
    }
    if (!bank?.config?.enabled) {
      if (this.isStrictEnv(env)) {
        throw new Error(
          "intent_config bank must be enabled in strict runtime environments.",
        );
      }
      this.cache = FALLBACK_BANK;
      this.cacheEnv = env;
      this.loadedAtMs = now;
      return this.cache;
    }

    // Soft-validate minimal shape so we never crash.
    const safe = this.softValidate(bank);
    this.cache = safe;
    this.cacheEnv = env;
    this.loadedAtMs = now;
    return this.cache;
  }

  decide(input: IntentDecisionInput): IntentDecisionOutput {
    const bank = this.getConfig(input.env);
    const cfg = bank.config;

    const notes: string[] = [];
    const signals = input.signals ?? {};
    const state = input.state ?? {};
    const prev = state.lastRoutingDecision ?? {};

    // 1) Normalize candidates (sort, drop low score)
    const sorted = [...(input.candidates ?? [])]
      .filter((c) => typeof c.score === "number")
      .sort((a, b) => b.score - a.score);

    const top = sorted[0];
    const second = sorted[1];

    // 2) Hard signal overrides (ChatGPT-like)
    // discoveryQuery → locate_docs (documents family)
    if (signals.discoveryQuery) {
      const domainId =
        input.candidates.find((c) => c.domainId)?.domainId ??
        state.activeDomain ??
        cfg.defaults.defaultDomainId;

      notes.push("override:discoveryQuery");
      return this.makeOutput({
        intentId: "documents",
        intentFamily: "documents",
        operatorId: cfg.operatorOverrides.discoveryQueryOperator,
        domainId,
        confidence: Math.max(top?.score ?? 0.7, 0.8),
        notes,
      });
    }

    // navQuery → open (or locate_file)
    if (signals.navQuery) {
      const domainId = state.activeDomain ?? cfg.defaults.defaultDomainId;
      notes.push("override:navQuery");
      return this.makeOutput({
        intentId: "file_actions",
        intentFamily: "file_actions",
        operatorId: cfg.operatorOverrides.navQueryOperator,
        domainId,
        confidence: Math.max(top?.score ?? 0.7, 0.8),
        notes,
      });
    }

    // explicit doc ref means documents intent should be preferred even if file_actions is close
    if (signals.hasExplicitDocRef) {
      notes.push("override:explicitDocRef_prefers_documents");
    }

    // 3) If no candidates, safe default
    if (!top) {
      notes.push("fallback:no_candidates");
      return this.makeOutput({
        intentId: cfg.defaults.defaultIntentId,
        intentFamily: cfg.defaults.defaultIntentFamily,
        operatorId: cfg.defaults.defaultOperatorId,
        domainId: state.activeDomain ?? cfg.defaults.defaultDomainId,
        confidence: cfg.defaults.defaultConfidence,
        notes,
      });
    }

    // 4) Compute margin and apply thresholds
    const margin = second ? top.score - second.score : 1.0;

    // If top score too low → prefer keeping prior on followup, else fall back to default intent
    const topBelowClarify = top.score < cfg.thresholds.forceClarifyTopBelow;

    // 5) Follow-up stability (ChatGPT-like)
    if (cfg.followupStability.enabled && signals.isFollowup && prev.intentId) {
      const followupConf = signals.followupConfidence ?? 0;
      const sticky =
        followupConf >= cfg.followupStability.stickyMinFollowupConfidence;

      const allowSwitch =
        (signals.hasExplicitDocRef &&
          cfg.followupStability.allowSwitchIfExplicitDocRef) ||
        (signals.discoveryQuery &&
          cfg.followupStability.allowSwitchIfDiscoveryQuery) ||
        (signals.navQuery && cfg.followupStability.allowSwitchIfNavQuery);

      const newStrongEnough =
        top.score >= cfg.followupStability.switchRequiresScoreGte &&
        top.score - (prev.confidence ?? 0) >=
          cfg.followupStability.switchRequiresImprovementGte;

      if (sticky && !allowSwitch && !newStrongEnough) {
        notes.push("followup:sticky_keep_previous_intent");
        return this.makeOutput({
          intentId: prev.intentId ?? cfg.defaults.defaultIntentId,
          intentFamily: prev.intentFamily ?? cfg.defaults.defaultIntentFamily,
          operatorId: prev.operatorId ?? cfg.defaults.defaultOperatorId,
          domainId:
            prev.domainId ?? state.activeDomain ?? cfg.defaults.defaultDomainId,
          confidence: prev.confidence ?? cfg.defaults.defaultConfidence,
          notes,
        });
      }

      if (allowSwitch) notes.push("followup:allow_switch_by_signal");
      if (newStrongEnough) notes.push("followup:switch_new_strong");
    }

    // 6) If explicit doc ref exists, bias away from file_actions list/sort/count unless the query is truly file-inventory
    // (This is still a config service; the orchestrator/operatorResolver should do the final call.
    // Here we only nudge intent choice.)
    const isFileActionsTop = top.intentId === "file_actions";
    if (signals.hasExplicitDocRef && isFileActionsTop) {
      notes.push("bias:explicitDocRef_demotes_file_actions");
      // pick best non-file_actions candidate if exists and reasonable
      const bestNonFile = sorted.find(
        (c) =>
          c.intentId !== "file_actions" &&
          c.score >= cfg.thresholds.minEmitScore,
      );
      if (bestNonFile) {
        return this.makeOutputFromCandidate(
          bestNonFile,
          cfg,
          state,
          notes,
          "picked_best_non_file_actions",
        );
      }
      // otherwise continue; sometimes user really wants "open X" which is file_actions
    }

    // 7) Autopick vs ambiguous handling
    const autopick =
      top.score >= cfg.thresholds.autopickScoreGte &&
      margin >= cfg.thresholds.autopickMarginGte;

    const ambiguous =
      second && (margin < cfg.thresholds.ambiguousMarginLt || topBelowClarify);

    if (ambiguous) {
      notes.push("decision:clarify_required");
      const clarifyDecision = this.makeOutputFromCandidate(
        top,
        cfg,
        state,
        notes,
        "picked_top_candidate",
      );
      clarifyDecision.requiresClarification = true;
      clarifyDecision.clarifyReason = topBelowClarify
        ? "low_confidence"
        : "ambiguous_margin";
      return clarifyDecision;
    }
    if (autopick) notes.push("decision:autopick");
    else notes.push("decision:default_pick_top");

    // 8) Build output from the top candidate (or fallback to family defaults)
    return this.makeOutputFromCandidate(
      top,
      cfg,
      state,
      notes,
      "picked_top_candidate",
    );
  }

  // -----------------------------
  // Helpers
  // -----------------------------

  private makeOutputFromCandidate(
    c: RouterCandidate,
    cfg: IntentConfigBank["config"],
    state: IntentStateSnapshot,
    notes: string[],
    reason: string,
  ): IntentDecisionOutput {
    notes.push(reason);

    const intentId = c.intentId ?? cfg.defaults.defaultIntentId;
    const family =
      c.intentFamily ??
      cfg.intents?.[intentId]?.family ??
      cfg.intentFamilies?.[intentId]?.id ??
      cfg.defaults.defaultIntentFamily;

    const operatorId =
      c.operatorId ??
      cfg.intents?.[intentId]?.defaultOperator ??
      cfg.intentFamilies?.[family]?.defaultOperator ??
      cfg.defaults.defaultOperatorId;

    const domainId =
      c.domainId ?? state.activeDomain ?? cfg.defaults.defaultDomainId;

    return this.makeOutput({
      intentId,
      intentFamily: family,
      operatorId,
      domainId,
      confidence: this.cap01(c.score),
      notes,
    });
  }

  private makeOutput(args: {
    intentId: string;
    intentFamily: string;
    operatorId: string;
    domainId: string;
    confidence: number;
    notes: string[];
  }): IntentDecisionOutput {
    const out: IntentDecisionOutput = {
      intentId: args.intentId,
      intentFamily: args.intentFamily,
      operatorId: args.operatorId,
      domainId: args.domainId,
      confidence: this.cap01(args.confidence),
      decisionNotes: [...args.notes],
      persistable: {
        intentId: args.intentId,
        operatorId: args.operatorId,
        intentFamily: args.intentFamily,
        domainId: args.domainId,
        confidence: this.cap01(args.confidence),
      },
    };
    return out;
  }

  private cap01(x: number) {
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(1, x));
  }

  private softValidate(bank: IntentConfigBank): IntentConfigBank {
    const sourceConfig = (bank.config || {}) as Record<string, any>;
    const sourceThresholds = (sourceConfig.thresholds || {}) as Record<
      string,
      number
    >;
    const sourceDefaults = (sourceConfig.defaults || {}) as Record<
      string,
      string | number
    >;
    const sourceOperatorOverrides = (sourceConfig.operatorOverrides ||
      {}) as Record<string, string>;
    const sourceIntentFamiliesRaw =
      sourceConfig.intentFamilies ?? (bank as any).intentFamilies ?? {};
    const sourceIntentFamilies = Array.isArray(sourceIntentFamiliesRaw)
      ? sourceIntentFamiliesRaw.reduce(
          (acc, entry) => {
            const id = String(entry?.id || "").trim();
            if (!id) return acc;
            acc[id] = {
              id,
              defaultOperator: String(
                entry?.defaultOperator ||
                  sourceConfig.defaultOperatorByFamily?.[id] ||
                  "",
              ).trim(),
              allowedOperators: Array.isArray(entry?.operatorsAllowed)
                ? entry.operatorsAllowed
                : undefined,
            };
            return acc;
          },
          {} as Record<
            string,
            {
              id: string;
              defaultOperator: string;
              allowedOperators?: string[];
            }
          >,
        )
      : (sourceIntentFamiliesRaw as Record<
          string,
          {
            id: string;
            defaultOperator: string;
            allowedOperators?: string[];
          }
        >);
    const sourceIntentsRaw =
      sourceConfig.intents ?? (bank as any).intents ?? {};
    const sourceIntents = Array.isArray(sourceIntentsRaw)
      ? sourceIntentsRaw.reduce(
          (acc, entry) => {
            const id = String(entry?.id || "").trim();
            if (!id) return acc;
            acc[id] = {
              id,
              family: String(entry?.intentFamily || entry?.family || "").trim(),
              defaultOperator: String(entry?.defaultOperator || "").trim(),
              preferredOperators: Array.isArray(entry?.operatorsAllowed)
                ? entry.operatorsAllowed
                : undefined,
            };
            return acc;
          },
          {} as Record<
            string,
            {
              id: string;
              family: string;
              defaultOperator?: string;
              preferredOperators?: string[];
            }
          >,
        )
      : (sourceIntentsRaw as Record<
          string,
          {
            id: string;
            family: string;
            defaultOperator?: string;
            preferredOperators?: string[];
          }
        >);

    const defaultIntentFamily = String(
      sourceConfig.defaultIntentFamily ||
        sourceDefaults.defaultIntentFamily ||
        sourceDefaults.fallbackIntentFamily ||
        FALLBACK_BANK.config.defaults.defaultIntentFamily,
    ).trim();
    const defaultOperator = String(
      sourceDefaults.defaultOperatorId ||
        sourceDefaults.fallbackOperator ||
        FALLBACK_BANK.config.defaults.defaultOperatorId,
    ).trim();
    const defaultDomainId = String(
      sourceDefaults.defaultDomainId ||
        sourceDefaults.fallbackDomainId ||
        FALLBACK_BANK.config.defaults.defaultDomainId,
    ).trim();
    const defaultConfidence = Number(
      sourceDefaults.defaultConfidence ??
        sourceThresholds.conversationConfidenceFloor ??
        FALLBACK_BANK.config.defaults.defaultConfidence,
    );

    // We do minimal merging with FALLBACK_BANK to prevent missing fields causing crashes.
    const merged: IntentConfigBank = {
      _meta: bank._meta ?? FALLBACK_BANK._meta,
      config: {
        ...FALLBACK_BANK.config,
        ...sourceConfig,
        thresholds: {
          ...FALLBACK_BANK.config.thresholds,
          ...sourceThresholds,
          minEmitScore:
            sourceThresholds.minEmitScore ??
            sourceThresholds.minEmitConfidence ??
            FALLBACK_BANK.config.thresholds.minEmitScore,
          autopickScoreGte:
            sourceThresholds.autopickScoreGte ??
            sourceThresholds.conversationConfidenceFloor ??
            FALLBACK_BANK.config.thresholds.autopickScoreGte,
          forceClarifyTopBelow:
            sourceThresholds.forceClarifyTopBelow ??
            sourceThresholds.forceClarifyBelow ??
            FALLBACK_BANK.config.thresholds.forceClarifyTopBelow,
        },
        followupStability: {
          ...FALLBACK_BANK.config.followupStability,
          ...(sourceConfig.followupStability ?? {}),
        },
        env: {
          ...FALLBACK_BANK.config.env,
          ...(sourceConfig.env ?? {}),
        },
        defaults: {
          ...FALLBACK_BANK.config.defaults,
          ...sourceDefaults,
          defaultIntentId:
            String(sourceDefaults.defaultIntentId || "").trim() ||
            defaultIntentFamily,
          defaultIntentFamily,
          defaultOperatorId: defaultOperator || "extract",
          defaultDomainId: defaultDomainId || "general",
          defaultConfidence: Number.isFinite(defaultConfidence)
            ? Math.max(0, Math.min(1, defaultConfidence))
            : FALLBACK_BANK.config.defaults.defaultConfidence,
        },
        operatorOverrides: {
          ...FALLBACK_BANK.config.operatorOverrides,
          ...sourceOperatorOverrides,
        },
        intentFamilies: {
          ...FALLBACK_BANK.config.intentFamilies,
          ...sourceIntentFamilies,
        },
        intents: {
          ...FALLBACK_BANK.config.intents,
          ...sourceIntents,
        },
      },
      tests: bank.tests ?? FALLBACK_BANK.tests,
    };
    return merged;
  }
}

// Singleton
let _intentConfig: IntentConfigService | null = null;
export function getIntentConfigService(): IntentConfigService {
  if (!_intentConfig) _intentConfig = new IntentConfigService();
  return _intentConfig;
}
export default IntentConfigService;
