import type {
  ConnectorHandlerService,
  ConnectorHandlerResult,
} from "../../../../services/core/handlers/connectorHandler.service";
import type { TokenVaultService } from "../../../../services/connectors/tokenVault.service";
import type { GmailOAuthService } from "../../../../services/connectors/gmail/gmailOAuth.service";
import type { OutlookOAuthService } from "../../../../services/connectors/outlook/outlookOAuth.service";
import type { SlackOAuthService } from "../../../../services/connectors/slack/slackOAuth.service";
import type { GmailClientService } from "../../../../services/connectors/gmail/gmailClient.service";
import type GraphClientService from "../../../../services/connectors/outlook/graphClient.service";
import type { SlackClientService } from "../../../../services/connectors/slack/slackClient.service";
import type { ChatRequest, ChatResult } from "../../domain/chat.types";
import type {
  ConnectorActionContext,
  Provider,
} from "./connectorTurn.shared";

export type HandlerDeps = {
  connectorHandler: Pick<ConnectorHandlerService, "execute">;
  tokenVault: Pick<TokenVaultService, "getValidAccessToken">;
  gmailOAuth: Pick<GmailOAuthService, "refreshAccessToken">;
  outlookOAuth: Pick<OutlookOAuthService, "refreshAccessToken">;
  slackOAuth: Pick<SlackOAuthService, "refreshAccessToken">;
  gmailClient: Pick<GmailClientService, "listMessages" | "getMessage">;
  graphClient: Pick<GraphClientService, "listMessages" | "getMessageText">;
  slackClient: Pick<
    SlackClientService,
    "listConversations" | "getConversationHistory" | "extractMessageText"
  >;
};

export type ConnectorTurnResultComposer = {
  compose: (
    base: ChatResult,
    patch: {
      assistantText: string;
      attachments?: unknown[];
      answerMode?: string;
      status?: ChatResult["status"];
      failureCode?: string | null;
      completion?: ChatResult["completion"];
    },
  ) => ChatResult;
  promptForProvider: (
    base: ChatResult,
    req: ChatRequest,
    providers: Provider[],
    intent?: "read" | "sync" | "connect" | "send" | "disconnect",
  ) => ChatResult;
  buildConnectorAccessFailure: (
    base: ChatResult,
    provider: Provider,
    error: unknown,
  ) => ChatResult;
  resolveProvider: (req: ChatRequest, allowed: Provider[]) => Provider | null;
};

export type ConnectorTurnRuntime = {
  withConnectorTimeout<T>(label: string, run: () => Promise<T>): Promise<T>;
  resolveProviderStatus(
    req: ChatRequest,
    base: ChatResult,
    provider: Provider,
  ): Promise<ConnectorHandlerResult>;
  getAccessToken(userId: string, provider: Provider): Promise<string>;
  baseContext(req: ChatRequest, base: ChatResult): ConnectorActionContext;
};
