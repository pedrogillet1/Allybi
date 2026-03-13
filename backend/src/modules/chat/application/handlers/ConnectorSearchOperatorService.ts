import GraphClientService, {
  type GraphMessageItem,
} from "../../../../services/connectors/outlook/graphClient.service";
import type { SlackMessage } from "../../../../services/connectors/slack/slackClient.service";
import type {
  ChatRequest,
  ChatResult,
} from "../../domain/chat.types";
import type { ConnectorHandlerResult } from "../../../../services/core/handlers/connectorHandler.service";
import type {
  ConnectorTurnResultComposer,
  ConnectorTurnRuntime,
  HandlerDeps,
} from "./connectorTurn.types";
import {
  ALL_PROVIDERS,
  EMAIL_PROVIDERS,
  type ConnectorOperator,
  type EmailCardAttachment,
  type EmailProvider,
  type Provider,
  type SlackCardAttachment,
  asRecord,
  asString,
  extractGmailText,
  normalizePreview,
  parseGmailHeader,
  providerLabel,
  searchQueryFromMessage,
} from "./connectorTurn.shared";

export class ConnectorSearchOperatorService {
  constructor(
    private readonly deps: HandlerDeps,
    private readonly runtime: ConnectorTurnRuntime,
    private readonly composer: ConnectorTurnResultComposer,
  ) {}

  async handleSearch(req: ChatRequest, base: ChatResult): Promise<ChatResult> {
    const provider = this.composer.resolveProvider(req, ALL_PROVIDERS);
    if (!provider) {
      return this.composer.promptForProvider(base, req, ALL_PROVIDERS, "read");
    }
    if (provider === "slack" && /\b(latest|recent|last)\b/i.test(req.message || "")) {
      const latest = await this.runtime.withConnectorTimeout(
        "Slack latest message fetch",
        () => this.fetchLatestSlackMessage(req.userId),
      );
      if (latest) {
        return this.composer.compose(base, {
          assistantText: "Latest Slack message is shown below.",
          attachments: [latest],
          answerMode: "action_receipt",
        });
      }
    }
    const result = await this.runtime.withConnectorTimeout(
      `${providerLabel(provider)} search`,
      () =>
        this.deps.connectorHandler.execute({
          action: "search",
          provider,
          context: this.runtime.baseContext(req, base),
          query: searchQueryFromMessage(req.message || ""),
          limit: 5,
        }),
    );
    if (!result.ok) {
      const msg = asString(result.error);
      if (/not connected|reconnect required/i.test(msg)) {
        return this.composer.promptForProvider(base, req, [provider], "connect");
      }
      return this.composer.compose(base, {
        assistantText: msg || "Connector search failed.",
        status: "failed",
        failureCode: "CONNECTOR_SEARCH_FAILED",
      });
    }
    const hits = Array.isArray(result.hits) ? result.hits : [];
    if (hits.length === 0) {
      return this.composer.compose(base, {
        assistantText: `No results found in ${providerLabel(provider)}.`,
        status: "partial",
        failureCode: "CONNECTOR_NO_RESULTS",
      });
    }
    const attachments = hits.map((hit) => this.toSearchAttachment(provider, hit));
    return this.composer.compose(base, {
      assistantText: `Found ${hits.length} result${hits.length === 1 ? "" : "s"} in ${providerLabel(provider)}.`,
      attachments,
      answerMode: "action_receipt",
    });
  }

  async handleLatestEmail(
    req: ChatRequest,
    base: ChatResult,
    operator: ConnectorOperator,
  ): Promise<ChatResult> {
    const provider = this.composer.resolveProvider(req, EMAIL_PROVIDERS);
    if (!provider || provider === "slack") {
      return this.composer.promptForProvider(base, req, EMAIL_PROVIDERS, "read");
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
    let latest: EmailCardAttachment | null = null;
    try {
      latest = await this.runtime.withConnectorTimeout(
        `${providerLabel(provider)} latest email fetch`,
        () => this.fetchLatestEmail(req.userId, provider),
      );
    } catch (error) {
      return this.composer.buildConnectorAccessFailure(base, provider, error);
    }
    if (!latest) {
      return this.composer.compose(base, {
        assistantText: `No recent emails found in ${providerLabel(provider)}.`,
        status: "partial",
        failureCode: "EMAIL_NOT_FOUND",
      });
    }
    if (operator === "EMAIL_EXPLAIN_LATEST" || operator === "EMAIL_SUMMARIZE_PREVIOUS") {
      return this.composer.compose(base, {
        assistantText: `Latest email in ${providerLabel(provider)}: ${latest.subject}. ${latest.preview || "No preview available."}`,
        attachments: [latest],
        answerMode: "action_receipt",
      });
    }
    return this.composer.compose(base, {
      assistantText: `Latest email in ${providerLabel(provider)} is shown below.`,
      attachments: [latest],
      answerMode: "action_receipt",
    });
  }

  private toSearchAttachment(
    provider: Provider,
    hit: { documentId: string; snippet: string; title?: string },
  ): EmailCardAttachment | SlackCardAttachment {
    const syntheticPrefix = `${provider}:`;
    const syntheticId = hit.documentId.startsWith(syntheticPrefix)
      ? hit.documentId.slice(syntheticPrefix.length).trim()
      : "";
    if (provider === "slack") {
      const hitRecord = asRecord(hit);
      const parsedChannel = (() => {
        const parts = hit.documentId.split(":");
        if (parts.length >= 2 && parts[0] === "slack") return parts[1];
        return "";
      })();
      return {
        type: "connector_slack_message",
        channelId: asString(hitRecord.providerChannelId) || parsedChannel || undefined,
        preview: normalizePreview(hit.snippet, 320),
      };
    }
    return {
      type: "connector_email_ref",
      provider: provider as EmailProvider,
      messageId: asString(asRecord(hit).providerMessageId) || syntheticId || undefined,
      cardTitle: "Email match",
      actionLabel: syntheticId ? "Open" : "View",
      subject: asString(hit.title) || "(no subject)",
      preview: normalizePreview(hit.snippet, 320),
      bodyText: normalizePreview(hit.snippet, 1200),
    };
  }

  private async fetchLatestEmail(
    userId: string,
    provider: EmailProvider,
  ): Promise<EmailCardAttachment | null> {
    const token = await this.runtime.getAccessToken(userId, provider);
    if (provider === "gmail") {
      const list = await this.deps.gmailClient.listMessages(token, {
        maxResults: 1,
        includeSpamTrash: false,
        labelIds: ["INBOX"],
      });
      const messageId = String(list?.messages?.[0]?.id || "").trim();
      if (!messageId) return null;
      const message = await this.deps.gmailClient.getMessage(token, messageId);
      const headers = asRecord(message?.payload).headers;
      const subject = parseGmailHeader(headers, "Subject") || "(no subject)";
      const from = parseGmailHeader(headers, "From");
      const to = parseGmailHeader(headers, "To");
      const cc = parseGmailHeader(headers, "Cc");
      const receivedAt =
        parseGmailHeader(headers, "Date") ||
        (message?.internalDate
          ? new Date(Number(message.internalDate)).toISOString()
          : undefined);
      const bodyText =
        extractGmailText(message?.payload) ||
        normalizePreview(message?.snippet || "", 320);
      return {
        type: "connector_email_ref",
        provider,
        messageId,
        cardTitle: "Latest email",
        actionLabel: "Open",
        subject,
        from,
        to,
        cc,
        receivedAt,
        preview: normalizePreview(bodyText, 320),
        bodyText: normalizePreview(bodyText, 1200),
      };
    }
    const list = await this.deps.graphClient.listMessages({
      accessToken: token,
      top: 1,
      folder: "Inbox",
    });
    const listRecord = asRecord(list);
    const listValue = Array.isArray(listRecord.value) ? listRecord.value : [];
    const msg = listValue.length > 0 ? listValue[0] : null;
    if (!msg) return null;
    const messageRecord = asRecord(msg);
    const graphMessage = msg as GraphMessageItem;
    const fromRecord = asRecord(messageRecord.from);
    const fromAddressRecord = asRecord(fromRecord.emailAddress);
    const firstAddress = (arr: unknown): string => {
      const list = Array.isArray(arr) ? arr : [];
      const first = asRecord(list[0]);
      const emailAddress = asRecord(first.emailAddress);
      return asString(emailAddress.address) || asString(emailAddress.name) || "";
    };
    return {
      type: "connector_email_ref",
      provider,
      messageId: asString(messageRecord.id),
      cardTitle: "Latest email",
      actionLabel: "Open",
      subject: asString(messageRecord.subject) || "(no subject)",
      from: asString(fromAddressRecord.address) || asString(fromAddressRecord.name),
      to: firstAddress(messageRecord.toRecipients),
      cc: firstAddress(messageRecord.ccRecipients),
      receivedAt: asString(messageRecord.receivedDateTime),
      preview: normalizePreview(this.deps.graphClient.getMessageText(graphMessage), 320),
      bodyText: normalizePreview(this.deps.graphClient.getMessageText(graphMessage), 1200),
    };
  }

  private async fetchLatestSlackMessage(
    userId: string,
  ): Promise<SlackCardAttachment | null> {
    const token = await this.runtime.getAccessToken(userId, "slack");
    const conversations = await this.deps.slackClient.listConversations({
      accessToken: token,
      excludeArchived: true,
      types: ["public_channel", "private_channel", "im", "mpim"],
      limit: 50,
    });
    const channels = Array.isArray(conversations.channels) ? conversations.channels : [];
    for (const channel of channels) {
      const channelRecord = asRecord(channel);
      const channelId = asString(channelRecord.id);
      if (!channelId) continue;
      try {
        const history = await this.deps.slackClient.getConversationHistory({
          accessToken: token,
          channelId,
          limit: 1,
        });
        const latest = Array.isArray(history.messages) ? history.messages[0] : null;
        if (!latest) continue;
        const preview = normalizePreview(
          this.deps.slackClient.extractMessageText(latest as SlackMessage),
          320,
        );
        if (!preview) continue;
        return {
          type: "connector_slack_message",
          channelId,
          channelName: asString(channelRecord.name),
          preview,
        };
      } catch {
        continue;
      }
    }
    return null;
  }
}
