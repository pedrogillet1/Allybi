/**
 * editingDispatch.test.ts
 *
 * Tests that the orchestrator correctly dispatches editing intents:
 * 1. "editing" intentFamily routes to editHandler fast path
 * 2. Returns edit_preview answerMode on successful plan
 * 3. Returns edit_undo answerMode for undo_edit operator
 * 4. Falls back to general_answer on edit error
 * 5. Without editHandler dep, falls through to normal pipeline
 * 6. Connector dispatch routes to connectorHandler
 * 7. Creative dispatch returns "coming soon" when no orchestrator
 */

import { describe, expect, test, jest, beforeAll, afterAll } from '@jest/globals';

// Mock the bank loader module so getBank returns safe stubs
jest.mock('../banks/bankLoader.service', () => ({
  getBank: (id: string) => {
    if (id === 'editing_microcopy') {
      return { copy: { preview: { en: { body: 'Edit preview ready.' } }, undo: { en: { body: 'Edit undone.' } }, error: { en: { body: 'Edit failed.' } } } };
    }
    if (id === 'connectors_microcopy') {
      return { copy: { connect: { start: { en: 'Connect {{provider}} to continue.' } }, sync: { started: { en: '{{provider}} sync started.' } } } };
    }
    return { _meta: {} };
  },
  getOptionalBank: () => null,
  hasBank: () => false,
  initBankLoader: async () => {},
}));

import { KodaOrchestratorV3Service, type OrchestratorDeps, type ChatTurnRequest } from './kodaOrchestrator.service';

// ---------------------------------------------------------------------------
// Helpers: minimal dep stubs
// ---------------------------------------------------------------------------

function stubDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    docIndexService: { getSnapshot: async () => ({ docCount: 5, candidates: [], lastUpdatedAt: new Date().toISOString() }) },
    queryNormalizer: { normalize: (t: string) => t },
    intentEngine: {
      resolve: async () => ({
        intentFamily: 'documents' as const,
        operator: 'extract',
        confidence: 0.8,
        signals: {},
        constraints: {},
      }),
    },
    queryRewriter: {
      rewrite: async () => ({
        rewrittenText: '',
        hints: { docRefs: { docIds: [], filenames: [] } },
        tokens: { tokensNonStopword: [] },
        signals: {},
      }),
    },
    scopeResolver: { resolve: async () => ({ hard: {}, soft: {} }) },
    candidateFilters: {
      apply: async () => ({
        candidates: [],
        hardConstraintApplied: false,
        hardConstraintEmpty: false,
        filterNotes: [],
      }),
    },
    retrievalEngine: {
      retrieve: async () => ({
        candidatesSearched: [],
        evidence: [],
        topDocs: [],
        stats: { docCountTotal: 0, candidateCount: 0, topScore: 0, margin: 0 },
      }),
    },
    ranker: {
      decide: async () => ({
        candidateCount: 0,
        topScore: 0,
        margin: 0,
        autopick: false,
        ambiguous: false,
      }),
    },
    answerModeRouter: {
      route: async () => ({ mode: 'general_answer' as const, reason: 'test' }),
    },
    answerEngine: {
      generate: async () => ({ draft: 'test answer', attachments: [] }),
    },
    renderPolicy: {
      apply: async ({ text }) => ({ text }),
    },
    docGroundingChecks: {
      check: async () => ({ verdict: 'pass' as const, reasons: [], recommendedAction: 'proceed' }),
    },
    qualityGates: {
      run: async () => ({ ok: true, actions: [] }),
    },
    fallbackEngine: {
      emit: async () => ({ content: 'fallback', answerMode: 'no_docs' as const, attachments: [] }),
    },
    stateUpdater: {
      apply: async () => ({}),
    },
    answerComposer: {
      finalizeOutput: (draft: string) => ({ content: draft }),
    },
    conversationMessages: {
      reply: async () => 'Hello!',
    },
    ...overrides,
  };
}

function chatRequest(overrides: Partial<ChatTurnRequest> = {}): ChatTurnRequest {
  return {
    conversationId: 'conv_1',
    turnId: 'turn_1',
    userId: 'user_1',
    text: 'Rewrite paragraph 3 to be more formal',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Orchestrator editing dispatch', () => {
  test('routes editing intent to editHandler and returns edit_preview', async () => {
    const executeMock = jest.fn<any>().mockResolvedValue({
      ok: true,
      mode: 'plan',
      result: { ok: true, plan: { domain: 'docx' } },
    });

    const deps = stubDeps({
      intentEngine: {
        resolve: async () => ({
          intentFamily: 'editing' as any,
          operator: 'edit_paragraph',
          confidence: 0.85,
          signals: {},
          constraints: {},
        }),
      },
      editHandler: { execute: executeMock } as any,
    });

    const orchestrator = new KodaOrchestratorV3Service(deps);
    const result = await orchestrator.handleTurn(chatRequest());

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(result.answerMode).toBe('edit_preview');
    expect(result.content).toBeTruthy();
    expect(result.meta?.intentFamily).toBe('editing');
    expect(result.meta?.operator).toBe('edit_paragraph');
  });

  test('routes undo_edit to editHandler with undo mode', async () => {
    const executeMock = jest.fn<any>().mockResolvedValue({
      ok: true,
      mode: 'undo',
      result: { ok: true },
    });

    const deps = stubDeps({
      intentEngine: {
        resolve: async () => ({
          intentFamily: 'editing' as any,
          operator: 'undo_edit',
          confidence: 0.90,
          signals: {},
          constraints: {},
        }),
      },
      editHandler: { execute: executeMock } as any,
    });

    const orchestrator = new KodaOrchestratorV3Service(deps);
    const result = await orchestrator.handleTurn(chatRequest({ text: 'undo the edit' }));

    expect(executeMock).toHaveBeenCalledTimes(1);
    const callArg = executeMock.mock.calls[0][0] as any;
    expect(callArg.mode).toBe('undo');
    expect(result.answerMode).toBe('edit_undo');
  });

  test('returns general_answer when editHandler fails', async () => {
    const executeMock = jest.fn<any>().mockResolvedValue({
      ok: false,
      mode: 'plan',
      error: 'Could not parse edit target',
    });

    const deps = stubDeps({
      intentEngine: {
        resolve: async () => ({
          intentFamily: 'editing' as any,
          operator: 'rewrite',
          confidence: 0.80,
          signals: {},
          constraints: {},
        }),
      },
      editHandler: { execute: executeMock } as any,
    });

    const orchestrator = new KodaOrchestratorV3Service(deps);
    const result = await orchestrator.handleTurn(chatRequest());

    expect(result.answerMode).toBe('general_answer');
    expect(result.content).toBeTruthy();
  });

  test('editing intent without editHandler dep falls through to normal pipeline', async () => {
    const deps = stubDeps({
      intentEngine: {
        resolve: async () => ({
          intentFamily: 'editing' as any,
          operator: 'edit_paragraph',
          confidence: 0.85,
          signals: {},
          constraints: {},
        }),
      },
      // No editHandler provided
    });

    const orchestrator = new KodaOrchestratorV3Service(deps);
    const result = await orchestrator.handleTurn(chatRequest());

    // Without editHandler, it falls through to the doc pipeline
    // Should not crash — should eventually return some response
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
  });

  test('passes correct context to editHandler', async () => {
    const executeMock = jest.fn<any>().mockResolvedValue({
      ok: true,
      mode: 'plan',
      result: { ok: true },
    });

    const deps = stubDeps({
      intentEngine: {
        resolve: async () => ({
          intentFamily: 'editing' as any,
          operator: 'fix_grammar',
          confidence: 0.85,
          signals: {},
          constraints: {},
        }),
      },
      editHandler: { execute: executeMock } as any,
    });

    const orchestrator = new KodaOrchestratorV3Service(deps);
    await orchestrator.handleTurn(chatRequest({
      userId: 'user_42',
      conversationId: 'conv_99',
      turnId: 'turn_77',
      attachedDocumentIds: ['doc_abc'],
    }));

    const callArg = executeMock.mock.calls[0][0] as any;
    expect(callArg.context.userId).toBe('user_42');
    expect(callArg.context.conversationId).toBe('conv_99');
    expect(callArg.context.correlationId).toBe('turn_77');
    expect(callArg.context.clientMessageId).toBe('turn_77');
    expect(callArg.planRequest).toBeDefined();
  });
});

describe('Orchestrator connector dispatch', () => {
  test('routes connectors intent to connectorHandler', async () => {
    const executeMock = jest.fn<any>().mockResolvedValue({
      ok: true,
      action: 'connect',
      provider: 'gmail',
      data: { authorizationUrl: 'https://accounts.google.com/oauth?state=abc' },
    });

    const deps = stubDeps({
      intentEngine: {
        resolve: async () => ({
          intentFamily: 'connectors' as any,
          operator: 'connect_gmail',
          confidence: 0.90,
          signals: {},
          constraints: {},
        }),
      },
      connectorHandler: { execute: executeMock } as any,
    });

    const orchestrator = new KodaOrchestratorV3Service(deps);
    const result = await orchestrator.handleTurn(chatRequest({ text: 'connect my gmail' }));

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(result.answerMode).toBe('connector_action');
    expect(result.content).toContain('gmail');
    expect(result.attachments?.length).toBeGreaterThanOrEqual(1);
  });

  test('connector search passes query text', async () => {
    const executeMock = jest.fn<any>().mockResolvedValue({
      ok: true,
      action: 'search',
      provider: 'gmail',
      hits: [{ documentId: 'doc1', title: 'Invoice Q3', snippet: '...invoice...', source: 'gmail' }],
      data: { count: 1 },
    });

    const deps = stubDeps({
      intentEngine: {
        resolve: async () => ({
          intentFamily: 'connectors' as any,
          operator: 'search_connector',
          confidence: 0.80,
          signals: {},
          constraints: {},
        }),
      },
      connectorHandler: { execute: executeMock } as any,
    });

    const orchestrator = new KodaOrchestratorV3Service(deps);
    const result = await orchestrator.handleTurn(chatRequest({ text: 'search my emails for invoice' }));

    const callArg = executeMock.mock.calls[0][0] as any;
    expect(callArg.action).toBe('search');
    expect(callArg.query).toBe('search my emails for invoice');
    expect(result.content).toContain('1');
  });
});

describe('Orchestrator creative dispatch', () => {
  test('returns coming soon when creativeOrchestrator is not provided', async () => {
    const deps = stubDeps({
      intentEngine: {
        resolve: async () => ({
          intentFamily: 'creative' as any,
          operator: 'generate_slide_visual',
          confidence: 0.80,
          signals: {},
          constraints: {},
        }),
      },
      // No creativeOrchestrator provided
    });

    const orchestrator = new KodaOrchestratorV3Service(deps);
    const result = await orchestrator.handleTurn(chatRequest({ text: 'create a visual for slide 5' }));

    expect(result.answerMode).toBe('general_answer');
    expect(result.content.toLowerCase()).toContain('coming soon');
  });

  test('coming soon message respects language (pt)', async () => {
    const deps = stubDeps({
      intentEngine: {
        resolve: async () => ({
          intentFamily: 'creative' as any,
          operator: 'generate_diagram',
          confidence: 0.80,
          signals: { language: 'pt' },
          constraints: {},
        }),
      },
    });

    const orchestrator = new KodaOrchestratorV3Service(deps);
    const result = await orchestrator.handleTurn(chatRequest({
      text: 'criar um diagrama',
      userPrefs: { language: 'pt' },
    }));

    expect(result.content.toLowerCase()).toContain('em breve');
    expect(result.language).toBe('pt');
  });
});
