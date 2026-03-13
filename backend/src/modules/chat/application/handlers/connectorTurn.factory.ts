import {
  ConnectorHandlerService,
} from "../../../../services/core/handlers/connectorHandler.service";
import { TokenVaultService } from "../../../../services/connectors/tokenVault.service";
import { GmailOAuthService } from "../../../../services/connectors/gmail/gmailOAuth.service";
import { OutlookOAuthService } from "../../../../services/connectors/outlook/outlookOAuth.service";
import { SlackOAuthService } from "../../../../services/connectors/slack/slackOAuth.service";
import { GmailClientService } from "../../../../services/connectors/gmail/gmailClient.service";
import GraphClientService from "../../../../services/connectors/outlook/graphClient.service";
import { SlackClientService } from "../../../../services/connectors/slack/slackClient.service";
import type { HandlerDeps } from "./connectorTurn.types";

export function createDefaultHandlerDeps(
  overrides?: Partial<HandlerDeps>,
): HandlerDeps {
  const tokenVault = new TokenVaultService();
  return {
    connectorHandler:
      overrides?.connectorHandler ?? new ConnectorHandlerService(),
    tokenVault: overrides?.tokenVault ?? tokenVault,
    gmailOAuth: overrides?.gmailOAuth ?? new GmailOAuthService(tokenVault),
    outlookOAuth:
      overrides?.outlookOAuth ?? new OutlookOAuthService({ tokenVault }),
    slackOAuth:
      overrides?.slackOAuth ?? new SlackOAuthService({ tokenVault }),
    gmailClient: overrides?.gmailClient ?? new GmailClientService(),
    graphClient: overrides?.graphClient ?? new GraphClientService(),
    slackClient: overrides?.slackClient ?? new SlackClientService(),
  };
}
