import type { ChatResult, TurnContext } from "../../domain/chat.types";
import type {
  ConnectorTurnResultComposer,
  ConnectorTurnRuntime,
  HandlerDeps,
} from "./connectorTurn.types";
import {
  ALL_PROVIDERS,
  type ConnectorOperator,
  providerLabel,
} from "./connectorTurn.shared";
import { ConnectorEmailSendOperatorService } from "./ConnectorEmailSendOperatorService";
import { ConnectorSearchOperatorService } from "./ConnectorSearchOperatorService";
import { ConnectorStatusOperatorService } from "./ConnectorStatusOperatorService";

export class ConnectorTurnOperatorService {
  private readonly statusService: ConnectorStatusOperatorService;
  private readonly searchService: ConnectorSearchOperatorService;
  private readonly emailSendService: ConnectorEmailSendOperatorService;

  constructor(
    private readonly deps: HandlerDeps,
    private readonly runtime: ConnectorTurnRuntime,
    private readonly composer: ConnectorTurnResultComposer,
  ) {
    this.statusService = new ConnectorStatusOperatorService(deps, runtime, composer);
    this.searchService = new ConnectorSearchOperatorService(deps, runtime, composer);
    this.emailSendService = new ConnectorEmailSendOperatorService(
      deps,
      runtime,
      composer,
    );
  }

  async handleOperator(params: {
    ctx: TurnContext;
    base: ChatResult;
    operator: ConnectorOperator;
  }): Promise<ChatResult> {
    const { ctx, base, operator } = params;
    const req = ctx.request;

    if (operator === "CONNECTOR_STATUS") {
      const provider = this.composer.resolveProvider(req, ALL_PROVIDERS);
      return this.statusService.executeStatus(
        req,
        base,
        provider ? [provider] : ALL_PROVIDERS,
      );
    }
    if (operator === "CONNECT_START") {
      const provider = this.composer.resolveProvider(req, ALL_PROVIDERS);
      return this.composer.promptForProvider(
        base,
        req,
        provider ? [provider] : ALL_PROVIDERS,
        "connect",
      );
    }
    if (operator === "CONNECTOR_SYNC") {
      return this.statusService.handleSync(req, base);
    }
    if (operator === "CONNECTOR_DISCONNECT") {
      return this.statusService.handleDisconnect(req, base);
    }
    if (operator === "CONNECTOR_SEARCH") {
      return this.searchService.handleSearch(req, base);
    }
    if (
      operator === "EMAIL_LATEST" ||
      operator === "EMAIL_EXPLAIN_LATEST" ||
      operator === "EMAIL_SUMMARIZE_PREVIOUS" ||
      operator === "EMAIL_DOC_FUSION"
    ) {
      return this.searchService.handleLatestEmail(req, base, operator);
    }
    if (operator === "EMAIL_DRAFT" || operator === "EMAIL_SEND") {
      return this.emailSendService.handleEmailSend(req, base);
    }
    return this.statusService.executeStatus(req, base, ALL_PROVIDERS);
  }
}
