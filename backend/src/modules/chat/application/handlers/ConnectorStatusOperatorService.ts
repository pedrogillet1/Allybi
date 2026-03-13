import type { ChatRequest, ChatResult } from "../../domain/chat.types";
import type {
  ConnectorTurnResultComposer,
  ConnectorTurnRuntime,
  HandlerDeps,
} from "./connectorTurn.types";
import {
  ALL_PROVIDERS,
  type Provider,
  asString,
  providerLabel,
} from "./connectorTurn.shared";

export class ConnectorStatusOperatorService {
  constructor(
    private readonly deps: HandlerDeps,
    private readonly runtime: ConnectorTurnRuntime,
    private readonly composer: ConnectorTurnResultComposer,
  ) {}

  async executeStatus(
    req: ChatRequest,
    base: ChatResult,
    providers: Provider[],
  ): Promise<ChatResult> {
    const context = this.runtime.baseContext(req, base);
    const attachments: Array<Record<string, unknown>> = [];
    const lines: string[] = [];
    for (const provider of providers) {
      const result = await this.deps.connectorHandler.execute({
        action: "status",
        provider,
        context,
      });
      const connected = Boolean(result?.data?.connected);
      const indexed = Number(result?.data?.indexedDocuments || 0) || 0;
      const reason = asString(result?.data?.reason) || null;
      attachments.push({
        type: "connector_status",
        provider,
        connected,
        indexedDocuments: indexed,
        expired: reason === "token_expired",
        reason,
      });
      if (!result.ok) {
        lines.push(`${providerLabel(provider)}: unavailable`);
      } else if (connected) {
        lines.push(`${providerLabel(provider)}: connected (${indexed} indexed)`);
      } else {
        lines.push(`${providerLabel(provider)}: not connected`);
      }
    }
    return this.composer.compose(base, {
      assistantText: lines.join("; "),
      attachments,
      answerMode: "action_receipt",
      status: "success",
    });
  }

  async handleSync(req: ChatRequest, base: ChatResult): Promise<ChatResult> {
    const provider = this.composer.resolveProvider(req, ALL_PROVIDERS);
    if (!provider) {
      return this.composer.promptForProvider(base, req, ALL_PROVIDERS, "sync");
    }
    const result = await this.deps.connectorHandler.execute({
      action: "sync",
      provider,
      context: this.runtime.baseContext(req, base),
    });
    if (!result.ok) {
      const msg = asString(result.error);
      if (/not connected|reconnect required/i.test(msg)) {
        return this.composer.promptForProvider(base, req, [provider], "connect");
      }
      return this.composer.compose(base, {
        assistantText: msg || `Sync failed for ${providerLabel(provider)}.`,
        status: "failed",
        failureCode: "CONNECTOR_SYNC_FAILED",
      });
    }
    const queued = asString(result.data?.mode) === "queued";
    return this.composer.compose(base, {
      assistantText: queued
        ? `Sync queued for ${providerLabel(provider)}.`
        : `Sync started for ${providerLabel(provider)}.`,
      attachments: [
        {
          type: "connector_status",
          provider,
          connected: true,
          indexedDocuments: Number(result.data?.syncedCount || 0) || 0,
        },
      ],
    });
  }

  async handleDisconnect(
    req: ChatRequest,
    base: ChatResult,
  ): Promise<ChatResult> {
    const provider = this.composer.resolveProvider(req, ALL_PROVIDERS);
    if (!provider) {
      return this.composer.promptForProvider(base, req, ALL_PROVIDERS, "disconnect");
    }
    const token = asString(req.confirmationToken);
    const expected = `disconnect:${provider}`;
    if (token !== expected) {
      return this.composer.compose(base, {
        assistantText: `Confirm disconnect for ${providerLabel(provider)}.`,
        answerMode: "action_confirmation",
        status: "clarification_required",
        failureCode: null,
        completion: {
          answered: false,
          missingSlots: [],
          nextAction: "confirm_disconnect",
        },
        attachments: [
          {
            type: "action_confirmation",
            operator: "CONNECTOR_DISCONNECT",
            confirmationId: expected,
            confirmLabel: "Disconnect",
            cancelLabel: "Cancel",
            confirmStyle: "danger",
          },
          { type: "connector_status", provider, connected: true },
        ],
      });
    }
    const result = await this.deps.connectorHandler.execute({
      action: "disconnect",
      provider,
      context: this.runtime.baseContext(req, base),
    });
    if (!result.ok) {
      return this.composer.compose(base, {
        assistantText:
          asString(result.error) || `Failed to disconnect ${providerLabel(provider)}.`,
        status: "failed",
        failureCode: "CONNECTOR_DISCONNECT_FAILED",
      });
    }
    return this.composer.compose(base, {
      assistantText: `${providerLabel(provider)} disconnected.`,
      attachments: [
        {
          type: "connector_status",
          provider,
          connected: false,
          indexedDocuments: Number(result.data?.indexedDocuments || 0) || 0,
        },
      ],
    });
  }
}
