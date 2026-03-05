import { describe, expect, test } from "@jest/globals";
import { TurnRouterService } from "../../services/chat/turnRouter.service";
import type { TurnContext } from "../../services/chat/chat.types";
import { writeCertificationGateReport } from "./reporting";

function makeCtx(messageText: string, overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    userId: "cert-user",
    messageText,
    locale: "en",
    now: new Date("2026-03-05T00:00:00.000Z"),
    attachedDocuments: [],
    connectors: { connected: {} },
    request: {
      userId: "cert-user",
      message: messageText,
      context: {},
    },
    ...overrides,
  };
}

describe("Certification: routing behavioral determinism", () => {
  test("core route expectations hold for connector, viewer, and document discovery paths", () => {
    const failures: string[] = [];
    const baseRouter = new TurnRouterService({
      isConnectorTurn: () => false,
    });
    const connectorRouter = new TurnRouterService({
      isConnectorTurn: () => true,
    });

    const scenarios: Array<{
      id: string;
      router: TurnRouterService;
      ctx: TurnContext;
      expectedRoute: string;
      expectedIntentFamily?: string;
      expectedOperatorId?: string;
    }> = [
      {
        id: "generic_capability_no_docs",
        router: baseRouter,
        ctx: makeCtx("which integrations do you support?"),
        expectedRoute: "GENERAL",
        expectedIntentFamily: "help",
        expectedOperatorId: "capabilities",
      },
      {
        id: "generic_capability_with_docs",
        router: baseRouter,
        ctx: makeCtx("which integrations do you support?", {
          attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
        }),
        expectedRoute: "KNOWLEDGE",
      },
      {
        id: "document_discovery_with_docs",
        router: baseRouter,
        ctx: makeCtx("where in the document is clause 4?", {
          attachedDocuments: [{ id: "doc-2", mime: "application/pdf" }],
        }),
        expectedRoute: "KNOWLEDGE",
        expectedIntentFamily: "documents",
        expectedOperatorId: "locate_docs",
      },
      {
        id: "explicit_docref_without_attachments",
        router: baseRouter,
        ctx: makeCtx("summarize quarterly_report.pdf"),
        expectedRoute: "KNOWLEDGE",
      },
      {
        id: "viewer_short_circuit_non_connector",
        router: baseRouter,
        ctx: makeCtx("what does this paragraph say?", {
          viewer: {
            mode: "viewer",
            documentId: "doc-viewer",
            fileType: "pdf",
          },
        }),
        expectedRoute: "KNOWLEDGE",
      },
      {
        id: "connector_precedence_non_viewer",
        router: connectorRouter,
        ctx: makeCtx("send this by email"),
        expectedRoute: "CONNECTOR",
      },
      {
        id: "connector_precedence_in_viewer",
        router: connectorRouter,
        ctx: makeCtx("send this by email", {
          viewer: {
            mode: "viewer",
            documentId: "doc-viewer",
            fileType: "pdf",
          },
        }),
        expectedRoute: "CONNECTOR",
      },
    ];

    for (const scenario of scenarios) {
      const out = scenario.router.decideWithIntent(scenario.ctx);
      if (out.route !== scenario.expectedRoute) {
        failures.push(
          `${scenario.id}:expected_route_${scenario.expectedRoute}:got_${out.route}`,
        );
      }
      if (
        scenario.expectedIntentFamily &&
        out.intentDecision?.intentFamily !== scenario.expectedIntentFamily
      ) {
        failures.push(
          `${scenario.id}:expected_family_${scenario.expectedIntentFamily}:got_${out.intentDecision?.intentFamily || "none"}`,
        );
      }
      if (
        scenario.expectedOperatorId &&
        out.intentDecision?.operatorId !== scenario.expectedOperatorId
      ) {
        failures.push(
          `${scenario.id}:expected_operator_${scenario.expectedOperatorId}:got_${out.intentDecision?.operatorId || "none"}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });

  test("generic capability query does not get forced into document discovery", () => {
    const router = new TurnRouterService({
      isConnectorTurn: () => false,
    });
    const out = router.decideWithIntent(
      makeCtx("which integrations do you support?"),
    );

    expect(out.route).toBe("GENERAL");
    expect(out.intentDecision?.intentFamily).toBe("help");
    expect(out.intentDecision?.operatorId).toBe("capabilities");
  });

  test("document-location query routes as document discovery with docs attached", () => {
    const router = new TurnRouterService({
      isConnectorTurn: () => false,
    });
    const out = router.decideWithIntent(
      makeCtx("where in the document is clause 4?", {
        attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
      }),
    );

    expect(out.route).toBe("KNOWLEDGE");
    expect(out.intentDecision?.intentFamily).toBe("documents");
    expect(out.intentDecision?.operatorId).toBe("locate_docs");
  });

  test("same input stays deterministic over repeated runs", () => {
    const router = new TurnRouterService({
      isConnectorTurn: () => false,
    });
    const ctx = makeCtx("which integrations do you support?");
    const first = router.decideWithIntent(ctx);
    for (let i = 0; i < 24; i += 1) {
      const next = router.decideWithIntent(ctx);
      expect(next).toEqual(first);
    }
  });

  test("writes routing-behavioral gate report", () => {
    const failures: string[] = [];
    const router = new TurnRouterService({
      isConnectorTurn: () => false,
    });
    const connectorRouter = new TurnRouterService({
      isConnectorTurn: () => true,
    });

    const deterministicCases: Array<{ id: string; ctx: TurnContext; router?: TurnRouterService }> = [
      { id: "generic_capability", ctx: makeCtx("which integrations do you support?") },
      {
        id: "generic_capability_with_docs",
        ctx: makeCtx("which integrations do you support?", {
          attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
        }),
      },
      {
        id: "document_discovery",
        ctx: makeCtx("where in the document is clause 4?", {
          attachedDocuments: [{ id: "doc-2", mime: "application/pdf" }],
        }),
      },
      { id: "explicit_filename", ctx: makeCtx("summarize quarterly_report.pdf") },
      { id: "help_howto", ctx: makeCtx("how do I use this?") },
      { id: "pt_discovery", ctx: makeCtx("onde no documento está a cláusula 4?", { locale: "pt" }) },
      { id: "pt_help", ctx: makeCtx("o que você pode fazer?", { locale: "pt" }) },
      { id: "es_help", ctx: makeCtx("que puedes hacer?", { locale: "es" }) },
      {
        id: "viewer_mode_non_connector",
        ctx: makeCtx("show this section", {
          viewer: {
            mode: "viewer",
            documentId: "doc-v1",
            fileType: "pdf",
          },
        }),
      },
      {
        id: "connector_non_viewer",
        ctx: makeCtx("send this by email"),
        router: connectorRouter,
      },
      {
        id: "connector_viewer",
        ctx: makeCtx("send this by email", {
          viewer: {
            mode: "viewer",
            documentId: "doc-v2",
            fileType: "pdf",
          },
        }),
        router: connectorRouter,
      },
      {
        id: "doc_ref_named",
        ctx: makeCtx('document named "Contract Master v2" summarize key terms'),
      },
      {
        id: "context_followup_true",
        ctx: makeCtx("and also the margin", {
          request: {
            userId: "cert-user",
            message: "and also the margin",
            context: {
              signals: {
                isFollowup: true,
                followupConfidence: 0.9,
              },
            },
          },
          attachedDocuments: [{ id: "doc-3", mime: "application/pdf" }],
        }),
      },
      {
        id: "context_followup_false",
        ctx: makeCtx("new question unrelated", {
          request: {
            userId: "cert-user",
            message: "new question unrelated",
            context: {
              signals: {
                isFollowup: false,
                followupConfidence: 0.2,
              },
            },
          },
        }),
      },
      { id: "file_action_open", ctx: makeCtx("open budget.xlsx") },
      { id: "smalltalk", ctx: makeCtx("hello there") },
      {
        id: "active_doc_without_attachments",
        ctx: makeCtx("what does this paragraph mean?", {
          activeDocument: { id: "active-1", mime: "application/pdf" },
        }),
      },
      {
        id: "nav_with_docs",
        ctx: makeCtx("show the list of files", {
          attachedDocuments: [{ id: "doc-4", mime: "application/pdf" }],
        }),
      },
    ];

    const generic = router.decideWithIntent(
      makeCtx("which integrations do you support?"),
    );
    if (generic.route !== "GENERAL") {
      failures.push(`generic_capability_route_expected_GENERAL_got_${generic.route}`);
    }
    if (generic.intentDecision?.intentFamily !== "help") {
      failures.push(
        `generic_capability_intent_expected_help_got_${generic.intentDecision?.intentFamily || "none"}`,
      );
    }
    if (generic.intentDecision?.operatorId !== "capabilities") {
      failures.push(
        `generic_capability_operator_expected_capabilities_got_${generic.intentDecision?.operatorId || "none"}`,
      );
    }

    const discovery = router.decideWithIntent(
      makeCtx("where in the document is clause 4?", {
        attachedDocuments: [{ id: "doc-1", mime: "application/pdf" }],
      }),
    );
    if (discovery.route !== "KNOWLEDGE") {
      failures.push(`document_location_route_expected_KNOWLEDGE_got_${discovery.route}`);
    }
    if (discovery.intentDecision?.intentFamily !== "documents") {
      failures.push(
        `document_location_intent_expected_documents_got_${discovery.intentDecision?.intentFamily || "none"}`,
      );
    }
    if (discovery.intentDecision?.operatorId !== "locate_docs") {
      failures.push(
        `document_location_operator_expected_locate_docs_got_${discovery.intentDecision?.operatorId || "none"}`,
      );
    }

    const deterministicCtx = makeCtx("which integrations do you support?");
    const first = router.decideWithIntent(deterministicCtx);
    const iterations = 25;
    let deterministicPasses = 0;
    for (let i = 0; i < iterations; i += 1) {
      const next = router.decideWithIntent(deterministicCtx);
      if (JSON.stringify(next) === JSON.stringify(first)) deterministicPasses += 1;
      else failures.push(`determinism_mismatch_iteration_${i + 1}`);
    }

    let deterministicCasePasses = 0;
    let deterministicCaseRuns = 0;
    for (const scenario of deterministicCases) {
      const scenarioRouter = scenario.router || router;
      const baseline = scenarioRouter.decideWithIntent(scenario.ctx);
      for (let i = 0; i < iterations; i += 1) {
        const next = scenarioRouter.decideWithIntent(scenario.ctx);
        deterministicCaseRuns += 1;
        if (JSON.stringify(next) === JSON.stringify(baseline)) {
          deterministicCasePasses += 1;
        } else {
          failures.push(`${scenario.id}:determinism_mismatch_iteration_${i + 1}`);
        }
      }
    }

    const routeQueriesTested = deterministicCases.length + 2;

    writeCertificationGateReport("routing-behavioral", {
      passed: failures.length === 0,
      metrics: {
        deterministicIterations: iterations,
        deterministicPasses,
        deterministicCaseRuns,
        deterministicCasePasses,
        deterministicCaseCount: deterministicCases.length,
        routeQueriesTested,
      },
      thresholds: {
        minDeterministicPasses: iterations,
        minDeterministicCasePasses: deterministicCaseRuns,
        minRouteQueries: 16,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
