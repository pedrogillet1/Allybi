import type {
  IntentSignals,
  RouterCandidate,
} from "../../../services/config/intentConfig.service";
import type { TurnContext } from "../domain/chat.types";
import type { ConnectorDecisionContext } from "./turnRoutePolicy.service";
import type {
  FileActionDetectionResult,
  FollowupDetectionResult,
} from "./turnRouter.shared";
import {
  getContextSignals,
  getPersistedIntentState,
  hasDocRefSignal,
  isDiscoveryQuery,
  isHowToQuery,
  isNavQuery,
  low,
  normalizeForMatching,
} from "./turnRouter.shared";
import type { FileActionBankProvider } from "./turnRouterCandidate.types";
import { TurnRouteBankPatternMatcher } from "./TurnRouteBankPatternMatcher";
import { TurnRouteCandidateRanker } from "./TurnRouteCandidateRanker";
import { TurnRouteFileActionDetector } from "./TurnRouteFileActionDetector";

export class TurnRouterCandidateService {
  private readonly patternMatcher: TurnRouteBankPatternMatcher;
  private readonly ranker: TurnRouteCandidateRanker;
  private readonly fileActionDetector: TurnRouteFileActionDetector;

  constructor(
    private readonly fileActionBankProvider: FileActionBankProvider,
    private readonly routingBankProvider: (bankId: string) => unknown | null,
  ) {
    this.patternMatcher = new TurnRouteBankPatternMatcher(routingBankProvider);
    this.ranker = new TurnRouteCandidateRanker(routingBankProvider);
    this.fileActionDetector = new TurnRouteFileActionDetector(
      fileActionBankProvider,
      routingBankProvider,
    );
  }

  buildCandidates(
    ctx: TurnContext,
    docsAvailable: boolean,
    followup: FollowupDetectionResult,
  ): RouterCandidate[] {
    const query = String(ctx.messageText || "");
    const locale = ctx.locale || "en";
    const nav = isNavQuery(query);
    const discovery = isDiscoveryQuery(query);
    const howTo = isHowToQuery(query);
    const fileAction = this.fileActionDetector.detectFileAction(query);
    const docRef = hasDocRefSignal(query);
    const patternCandidates = this.patternMatcher.detectIntentPatternCandidates(
      query,
      locale,
      docsAvailable,
    );

    const candidates: RouterCandidate[] = [...patternCandidates];
    const hasFamily = (family: string) =>
      candidates.some(
        (candidate) => low(candidate.intentFamily || "") === low(family),
      );

    if (!hasFamily("documents") && (docsAvailable || discovery || docRef)) {
      candidates.push({
        intentId: "documents",
        operatorId: discovery ? "locate_docs" : "extract",
        intentFamily: "documents",
        domainId: "general",
        score:
          (docsAvailable ? 0.82 : 0.72) +
          this.patternMatcher.getRoutingPriorityBoost("documents"),
      });
    }
    if (fileAction.kind === "matched" && !hasFamily("file_actions")) {
      candidates.push({
        intentId: "file_actions",
        operatorId: fileAction.operatorId,
        intentFamily: "file_actions",
        domainId: "general",
        score: Math.max(
          0.84 + this.patternMatcher.getRoutingPriorityBoost("file_actions"),
          fileAction.confidence +
            this.patternMatcher.getRoutingPriorityBoost("file_actions"),
        ),
      });
    } else if (
      fileAction.kind !== "suppressed" &&
      nav &&
      !hasFamily("file_actions")
    ) {
      candidates.push({
        intentId: "file_actions",
        operatorId: "open",
        intentFamily: "file_actions",
        domainId: "general",
        score:
          (docsAvailable ? 0.76 : 0.82) +
          this.patternMatcher.getRoutingPriorityBoost("file_actions"),
      });
    }
    if (howTo && !hasFamily("help")) {
      candidates.push({
        intentId: "help",
        operatorId: "how_to",
        intentFamily: "help",
        domainId: "general",
        score: 0.72 + this.patternMatcher.getRoutingPriorityBoost("help"),
      });
    }
    if (!hasFamily("help")) {
      candidates.push({
        intentId: "help",
        operatorId: "capabilities",
        intentFamily: "help",
        domainId: "general",
        score:
          (docsAvailable ? 0.36 : 0.58) +
          this.patternMatcher.getRoutingPriorityBoost("help"),
      });
    }
    this.ranker.applyRoutingTiebreakers(ctx, candidates, {
      hasExplicitDocRef: docRef,
      isFollowup: followup.isFollowup,
    });
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }

  buildSignals(
    ctx: TurnContext,
    docsAvailable: boolean,
    candidates: RouterCandidate[],
    followup: FollowupDetectionResult,
  ): IntentSignals {
    const contextSignals = getContextSignals(ctx);
    const query = String(ctx.messageText || "");
    const docRef = hasDocRefSignal(query);
    const discoveryFromPattern = this.hasOperatorCandidate(candidates, [
      "locate_docs",
    ]);
    const navFromPattern = this.hasOperatorCandidate(candidates, [
      "open",
      "locate_file",
      "list",
      "filter",
      "sort",
      "group",
      "count_files",
    ]);
    const explicitFollowup =
      typeof contextSignals.isFollowup === "boolean"
        ? contextSignals.isFollowup
        : null;
    return {
      isFollowup:
        explicitFollowup !== null ? explicitFollowup : followup.isFollowup,
      followupConfidence:
        typeof contextSignals.followupConfidence === "number"
          ? contextSignals.followupConfidence
          : followup.confidence != null
            ? followup.confidence
            : undefined,
      hasExplicitDocRef: contextSignals.explicitDocRef === true || docRef,
      discoveryQuery:
        contextSignals.discoveryQuery === true ||
        discoveryFromPattern ||
        (isDiscoveryQuery(query) && (docsAvailable || docRef)),
      navQuery:
        contextSignals.navQuery === true ||
        navFromPattern ||
        (isNavQuery(query) && (docsAvailable || docRef)),
      userRequestedShort:
        contextSignals.userRequestedShort === true ||
        ctx.request.truncationRetry === true,
      userRequestedDetailed: contextSignals.userRequestedDetailed === true,
      userSaidPickForMe: contextSignals.userSaidPickForMe === true,
    };
  }

  buildConnectorDecisionContext(
    ctx: TurnContext,
  ): ConnectorDecisionContext {
    const contextSignals = getContextSignals(ctx);
    const activeProvider = String(ctx.connectors?.activeConnector || "")
      .trim()
      .toLowerCase();
    const normalizedActive =
      activeProvider === "gmail" ||
      activeProvider === "outlook" ||
      activeProvider === "slack" ||
      activeProvider === "email"
        ? (activeProvider as "gmail" | "outlook" | "slack" | "email")
        : null;
    return {
      activeProvider: normalizedActive,
      connectedProviders: {
        ...(ctx.connectors?.connected || {}),
      },
      hasConnectorReadPermission:
        contextSignals.hasConnectorReadPermission === true,
    };
  }

  private hasOperatorCandidate(
    candidates: RouterCandidate[],
    operators: string[],
  ): boolean {
    return this.ranker.hasOperatorCandidate(candidates, operators);
  }
}
