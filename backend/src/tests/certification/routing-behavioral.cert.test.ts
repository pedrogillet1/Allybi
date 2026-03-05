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
    let deterministicPasses = 0;
    const iterations = 25;
    for (let i = 0; i < iterations; i += 1) {
      const next = router.decideWithIntent(deterministicCtx);
      if (JSON.stringify(next) === JSON.stringify(first)) deterministicPasses += 1;
      else failures.push(`determinism_mismatch_iteration_${i + 1}`);
    }

    writeCertificationGateReport("routing-behavioral", {
      passed: failures.length === 0,
      metrics: {
        deterministicIterations: iterations,
        deterministicPasses,
        routeQueriesTested: 2,
      },
      thresholds: {
        minDeterministicPasses: iterations,
        minRouteQueries: 2,
      },
      failures,
    });

    expect(failures).toEqual([]);
  });
});
