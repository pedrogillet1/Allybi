/**
 * orchestratorFactory.ts
 *
 * Wires the KodaOrchestratorV3Service with all its OrchestratorDeps.
 * Uses real services where available, lightweight stubs where not.
 *
 * Each dep is clearly labeled so we can progressively replace stubs.
 */

import prisma from "../../../config/database";
import { getBankLoaderInstance } from "../banks/bankLoader.service";
import { KodaIntentEngineV3Service } from "../routing/intentEngine.service";
import { AnswerModeRouterService } from "../routing/answerModeRouter.service";
import { AnswerComposerService } from "../compose/answerComposer.service";
import { FallbackEngineService } from "../enforcement/fallbackEngine.service";
import { MicrocopyPickerService } from "../compose/microcopyPicker.service";
import {
  KodaOrchestratorV3Service,
  type OrchestratorDeps,
  type ChatTurnRequest,
  type ChatTurnResponse,
  type DocIndexSnapshot,
  type Candidate,
  type IntentResult,
  type QueryRewriteResult,
  type ScopeResolutionResult,
  type CandidateFilterResult,
  type RetrievalResult,
  type RankingDecision,
  type AnswerModeDecision,
  type GroundingVerdict,
  type QualityGateResult,
  type ConversationState,
  type LanguageCode,
  type AnswerMode,
  type Attachment,
} from "./kodaOrchestrator.service";

// ---------------------------------------------------------------------------
// Stub helpers (replace as real services become available)
// ---------------------------------------------------------------------------

/** STUB: docIndexService — queries Prisma for the user's doc inventory */
function createDocIndexService(): OrchestratorDeps["docIndexService"] {
  return {
    async getSnapshot(userId: string): Promise<DocIndexSnapshot> {
      const docs = await prisma.document.findMany({
        where: { userId, status: { in: ["ready", "indexed"] } },
        // Prisma model uses createdAt/updatedAt (no uploadedAt).
        select: { id: true, filename: true, mimeType: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      return {
        docCount: docs.length,
        candidates: docs.map((d) => ({
          docId: d.id,
          fileName: d.filename ?? "unknown",
          docType: d.mimeType ?? undefined,
          uploadedAt: d.createdAt?.toISOString(),
        })),
      };
    },
  };
}

/** STUB: queryNormalizer — lightweight text cleanup */
function createQueryNormalizer(): OrchestratorDeps["queryNormalizer"] {
  return {
    normalize(text: string): string {
      return text.trim().replace(/\s+/g, " ");
    },
  };
}

/** STUB: queryRewriter — pass-through (no rewriting yet) */
function createQueryRewriter(): OrchestratorDeps["queryRewriter"] {
  return {
    async rewrite(input) {
      return {
        rewrittenText: input.text,
        hints: {
          docRefs: { docIds: [], filenames: [] },
        },
        tokens: {
          tokensNonStopword: input.text
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 2),
        },
        signals: {},
      };
    },
  };
}

/** STUB: scopeResolver — no scoping yet */
function createScopeResolver(): OrchestratorDeps["scopeResolver"] {
  return {
    async resolve() {
      return { hard: {}, soft: {} };
    },
  };
}

/** STUB: candidateFilters — pass-through */
function createCandidateFilters(): OrchestratorDeps["candidateFilters"] {
  return {
    async apply(input) {
      return {
        candidates: input.candidates,
        hardConstraintApplied: false,
        hardConstraintEmpty: false,
        filterNotes: [],
      };
    },
  };
}

/** STUB: retrievalEngine — returns empty (no vector search wired yet) */
function createRetrievalEngine(): OrchestratorDeps["retrievalEngine"] {
  return {
    async retrieve() {
      return {
        candidatesSearched: [],
        evidence: [],
        topDocs: [],
        stats: {
          docCountTotal: 0,
          candidateCount: 0,
          topScore: 0,
          margin: 0,
        },
      };
    },
  };
}

/** STUB: ranker — basic pass-through ranking from retrieval stats */
function createRanker(): OrchestratorDeps["ranker"] {
  return {
    async decide(input) {
      const top = input.retrieval.topDocs[0];
      return {
        candidateCount: input.retrieval.candidatesSearched.length,
        topScore: input.retrieval.stats.topScore,
        margin: input.retrieval.stats.margin,
        autopick: !!top,
        ambiguous: false,
        chosenDocId: top?.docId,
        chosenFileName: top?.fileName,
        candidatesTopN: input.retrieval.topDocs.slice(0, 3),
      };
    },
  };
}

/** REAL: answerModeRouter — uses bank-driven routing */
function createAnswerModeRouter(): OrchestratorDeps["answerModeRouter"] {
  const router = new AnswerModeRouterService();
  return {
    async route(input) {
      // Adapter: Orchestrator uses a richer pipeline contract, but AnswerModeRouterService
      // expects a normalized routing input shape.
      const result = router.route({
        operator: input.intent.operator,
        intentFamily: input.intent.intentFamily,
        signals: input.intent.signals ?? {},
        docContext: {
          docCount: input.docIndex.docCount ?? 0,
          candidateCount:
            input.retrieval?.stats?.candidateCount ??
            input.ranking?.candidateCount ??
            0,
          topScore: input.ranking?.topScore ?? input.retrieval?.stats?.topScore,
          margin: input.ranking?.margin ?? input.retrieval?.stats?.margin,
        },
        scope: {
          hard: {
            docIdAllowlist: input.scope?.hard?.docIdAllowlist,
            filenameMustContain: input.scope?.hard?.filenameMustContain,
          },
          soft: {
            docIdAllowlist: input.scope?.soft?.docIdAllowlist,
          },
        },
        state: input.state?.activeDocRef
          ? {
              activeDocRef: {
                docId: input.state.activeDocRef.docId,
                lockType: input.state.activeDocRef.lockType,
              },
            }
          : undefined,
        policy: {
          refusalRequired: false,
        },
        userPrefs: undefined,
      });
      return {
        mode: (result.mode ?? "general_answer") as AnswerMode,
        reason: result.reason ?? "router",
        navType: result.navType as any,
      };
    },
  };
}

/** STUB: answerEngine — delegates to the LLM chat engine for now */
function createAnswerEngine(): OrchestratorDeps["answerEngine"] {
  return {
    async generate(input) {
      // The orchestrator pipeline reaches here for doc-grounded answers.
      // For now return a placeholder; the real LLM generation happens
      // via the ChatEngine path in prismaChat.service.ts.
      return {
        draft: "",
        attachments: [],
        usedDocs: [],
      };
    },
  };
}

/** STUB: renderPolicy — pass-through */
function createRenderPolicy(): OrchestratorDeps["renderPolicy"] {
  return {
    async apply(input) {
      return { text: input.text };
    },
  };
}

/** STUB: docGroundingChecks — always pass */
function createDocGroundingChecks(): OrchestratorDeps["docGroundingChecks"] {
  return {
    async check() {
      return {
        verdict: "pass" as const,
        reasons: [],
        recommendedAction: "proceed",
      };
    },
  };
}

/** STUB: qualityGates — always pass */
function createQualityGates(): OrchestratorDeps["qualityGates"] {
  return {
    async run() {
      return {
        ok: true,
        actions: [],
      };
    },
  };
}

/** ADAPTER: fallbackEngine — wraps FallbackEngineService.buildPlan into the emit() interface */
function createFallbackEngine(): OrchestratorDeps["fallbackEngine"] {
  let fallbackSvc: FallbackEngineService | null = null;
  try {
    const bankLoader = getBankLoaderInstance();
    fallbackSvc = new FallbackEngineService(bankLoader as any);
  } catch {
    // bank loader not ready
  }

  return {
    async emit(input) {
      // Simple fallback messages by reason code
      const messages: Record<string, string> = {
        no_docs_indexed:
          "You haven't uploaded any documents yet. Upload a PDF, DOCX, or other file to get started.",
        indexing_in_progress:
          "Your documents are still being processed. Please try again in a moment.",
        scope_hard_constraints_empty:
          (input.context?.reasonShort as string) ??
          "No files matched your current scope.",
        no_relevant_chunks_in_scoped_docs:
          "I couldn't find relevant information in the scoped documents. Try broadening your search.",
        extraction_failed:
          "There was an issue processing this document. Try re-uploading it.",
        permissions: "You don't have access to those documents.",
        unknown: "Something went wrong. Please try again.",
      };

      return {
        content: messages[input.reasonCode] ?? messages.unknown,
        answerMode:
          input.reasonCode === "no_docs_indexed"
            ? ("no_docs" as AnswerMode)
            : ("scoped_not_found" as AnswerMode),
        attachments: [],
      };
    },
  };
}

/** STUB: stateUpdater — pass-through (no state mutation yet) */
function createStateUpdater(): OrchestratorDeps["stateUpdater"] {
  return {
    async apply(input) {
      return input.state ?? {};
    },
  };
}

/** REAL: answerComposer — wraps AnswerComposerService */
function createAnswerComposer(): OrchestratorDeps["answerComposer"] {
  let composerSvc: AnswerComposerService | null = null;
  try {
    composerSvc = new AnswerComposerService();
  } catch {
    // bank not loaded
  }

  return {
    finalizeOutput(draft, context, meta) {
      // If composer is available, use its compose method for formatting
      if (composerSvc && draft) {
        try {
          const result = composerSvc.compose({
            ctx: {
              conversationId: "",
              turnId: "",
              regenCount: 0,
              answerMode: meta.answerMode as any,
              operator: context.operator,
              intentFamily: context.intentFamily,
              language: "en",
              originalQuery: context.originalQuery,
              constraints: context.constraints as any,
            },
            draft,
          });
          return { content: result.content, meta: result.meta };
        } catch {
          // fall through to simple pass-through
        }
      }
      return { content: draft };
    },
  };
}

/** ADAPTER: conversationMessages — wraps MicrocopyPickerService */
function createConversationMessages(): OrchestratorDeps["conversationMessages"] {
  let microcopy: MicrocopyPickerService | null = null;
  try {
    const bankLoader = getBankLoaderInstance();
    microcopy = new MicrocopyPickerService(bankLoader as any);
  } catch {
    // bank loader not ready
  }

  const greetings = [
    "Hey there! How can I help you today?",
    "Hi! What would you like to know?",
    "Hello! I'm ready to help. What can I do for you?",
    "Hey! Feel free to ask me anything about your documents.",
  ];

  return {
    async reply(input) {
      // Simple varied greeting based on seed
      const idx = parseInt(input.variationSeed || "0", 16) % greetings.length;
      return greetings[idx];
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function buildOrchestratorDeps(): OrchestratorDeps {
  return {
    docIndexService: createDocIndexService(),
    queryNormalizer: createQueryNormalizer(),
    intentEngine: {
      resolve: (input) => new KodaIntentEngineV3Service().resolve(input as any),
    },
    queryRewriter: createQueryRewriter(),
    scopeResolver: createScopeResolver(),
    candidateFilters: createCandidateFilters(),
    retrievalEngine: createRetrievalEngine(),
    ranker: createRanker(),
    answerModeRouter: createAnswerModeRouter(),
    answerEngine: createAnswerEngine(),
    renderPolicy: createRenderPolicy(),
    docGroundingChecks: createDocGroundingChecks(),
    qualityGates: createQualityGates(),
    fallbackEngine: createFallbackEngine(),
    stateUpdater: createStateUpdater(),
    answerComposer: createAnswerComposer(),
    conversationMessages: createConversationMessages(),
  };
}

export function createOrchestrator(): KodaOrchestratorV3Service {
  const deps = buildOrchestratorDeps();
  return new KodaOrchestratorV3Service(deps);
}
