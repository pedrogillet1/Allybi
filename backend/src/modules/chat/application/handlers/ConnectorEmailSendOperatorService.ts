import type { ConnectorHandlerResult } from "../../../../services/core/handlers/connectorHandler.service";
import { verifyEmailSendConfirmationToken } from "../../../../services/connectors/emailSendConfirmation.service";
import type { ChatRequest, ChatResult } from "../../domain/chat.types";
import type {
  ConnectorTurnResultComposer,
  ConnectorTurnRuntime,
  HandlerDeps,
} from "./connectorTurn.types";
import {
  EMAIL_PROVIDERS,
  type EmailProvider,
  asString,
  parseEmailDraft,
  providerLabel,
} from "./connectorTurn.shared";

export class ConnectorEmailSendOperatorService {
  constructor(
    private readonly deps: HandlerDeps,
    private readonly runtime: ConnectorTurnRuntime,
    private readonly composer: ConnectorTurnResultComposer,
  ) {}

  async handleEmailSend(req: ChatRequest, base: ChatResult): Promise<ChatResult> {
    let provider = this.composer.resolveProvider(req, EMAIL_PROVIDERS);
    if (!provider) {
      provider = await this.resolveSingleConnectedEmailProvider(req, base);
    }
    if (!provider) {
      return this.composer.promptForProvider(base, req, EMAIL_PROVIDERS, "send");
    }
    let status: ConnectorHandlerResult;
    try {
      status = await this.runtime.withConnectorTimeout(
        `${providerLabel(provider)} status check`,
        () => this.runtime.resolveProviderStatus(req, base, provider),
      );
    } catch (error) {
      return this.composer.buildConnectorAccessFailure(base, provider, error);
    }
    if (!status.ok || !status.data?.connected) {
      return this.composer.promptForProvider(base, req, [provider], "connect");
    }

    const confirmationToken = asString(req.confirmationToken);
    if (!confirmationToken) {
      const draft = parseEmailDraft(req.message || "");
      return this.composer.compose(base, {
        assistantText: "Draft ready. Review and send when you are ready.",
        answerMode: "action_confirmation",
        status: "clarification_required",
        failureCode: null,
        completion: {
          answered: false,
          missingSlots: [],
          nextAction: "confirm_send",
        },
        attachments: [
          {
            type: "action_confirmation",
            operator: "EMAIL_SEND",
            confirmLabel: "Send",
            cancelLabel: "Cancel",
            confirmStyle: "primary",
          },
          {
            type: "email_draft_snapshot",
            provider,
            providerLabel: providerLabel(provider),
            to: draft.to,
            subject: draft.subject,
            body: draft.body,
          },
        ],
      });
    }

    let payload;
    try {
      payload = verifyEmailSendConfirmationToken(confirmationToken);
    } catch (error) {
      return this.composer.compose(base, {
        assistantText: error instanceof Error ? error.message : "Invalid token.",
        answerMode: "action_receipt",
        status: "failed",
        failureCode: "INVALID_CONFIRMATION",
      });
    }
    if (payload.userId !== req.userId) {
      return this.composer.compose(base, {
        assistantText: "Confirmation token does not belong to this user.",
        answerMode: "action_receipt",
        status: "blocked",
        failureCode: "INVALID_CONFIRMATION_USER",
      });
    }
    let sendResult: ConnectorHandlerResult;
    try {
      sendResult = await this.runtime.withConnectorTimeout(
        `${providerLabel(payload.provider)} send`,
        () =>
          this.deps.connectorHandler.execute({
            action: "send",
            provider: payload.provider,
            context: this.runtime.baseContext(req, base),
            to: payload.to,
            subject: payload.subject,
            body: payload.body,
            confirmationId: confirmationToken,
            attachmentDocumentIds: payload.attachmentDocumentIds,
          }),
      );
    } catch (error) {
      return this.composeSendFailure(
        base,
        payload.provider,
        payload.to,
        payload.subject,
        payload.body,
        error instanceof Error ? error.message : "Failed to send email.",
      );
    }
    if (!sendResult.ok) {
      return this.composeSendFailure(
        base,
        payload.provider,
        payload.to,
        payload.subject,
        payload.body,
        sendResult.error || "Failed to send email.",
      );
    }
    return this.composer.compose(base, {
      assistantText: `Email sent via ${providerLabel(payload.provider)}.`,
      answerMode: "action_receipt",
      status: "success",
      attachments: [
        {
          type: "action_confirmation",
          operator: "EMAIL_SEND",
          confirmLabel: "Send",
          cancelLabel: "Cancel",
          confirmStyle: "primary",
        },
        {
          type: "email_draft_snapshot",
          provider: payload.provider,
          providerLabel: providerLabel(payload.provider),
          to: payload.to,
          subject: payload.subject,
          body: payload.body,
          status: "sent",
        },
      ],
    });
  }

  private composeSendFailure(
    base: ChatResult,
    provider: EmailProvider,
    to: string,
    subject: string,
    body: string,
    message: string,
  ): ChatResult {
    return this.composer.compose(base, {
      assistantText: message,
      answerMode: "action_receipt",
      status: "failed",
      failureCode: "EMAIL_SEND_FAILED",
      attachments: [
        {
          type: "action_confirmation",
          operator: "EMAIL_SEND",
          confirmLabel: "Send",
          cancelLabel: "Cancel",
          confirmStyle: "primary",
        },
        {
          type: "email_draft_snapshot",
          provider,
          providerLabel: providerLabel(provider),
          to,
          subject,
          body,
        },
      ],
    });
  }

  private async resolveSingleConnectedEmailProvider(
    req: ChatRequest,
    base: ChatResult,
  ): Promise<EmailProvider | null> {
    const connected: EmailProvider[] = [];
    for (const candidate of EMAIL_PROVIDERS) {
      try {
        const status = await this.runtime.withConnectorTimeout(
          `${providerLabel(candidate)} status check`,
          () => this.runtime.resolveProviderStatus(req, base, candidate),
        );
        if (status.ok && status.data?.connected) {
          connected.push(candidate);
          if (connected.length > 1) return null;
        }
      } catch {
        continue;
      }
    }
    return connected.length === 1 ? connected[0] : null;
  }
}
