import {
  getConnectorCapabilities,
  registerConnector,
} from "./connectorsRegistry";
import { GmailOAuthService } from "./gmail/gmailOAuth.service";
import { GmailClientService } from "./gmail/gmailClient.service";
import { GmailSyncService } from "./gmail/gmailSync.service";
import { OutlookOAuthService } from "./outlook/outlookOAuth.service";
import GraphClientService from "./outlook/graphClient.service";
import { OutlookSyncService } from "./outlook/outlookSync.service";
import { SlackOAuthService } from "./slack/slackOAuth.service";
import { SlackClientService } from "./slack/slackClient.service";
import { SlackSyncService } from "./slack/slackSync.service";

let registered = false;

/**
 * Registers all built-in connector providers in one place to avoid drift
 * between API and worker bootstraps.
 */
export function registerDefaultConnectors(opts?: { force?: boolean }): void {
  if (registered && !opts?.force) return;

  registerConnector("gmail", {
    capabilities: getConnectorCapabilities("gmail"),
    oauthService: new GmailOAuthService(),
    clientService: new GmailClientService(),
    syncService: new GmailSyncService(),
  });

  registerConnector("outlook", {
    capabilities: getConnectorCapabilities("outlook"),
    oauthService: new OutlookOAuthService(),
    clientService: new GraphClientService(),
    syncService: new OutlookSyncService(),
  });

  registerConnector("slack", {
    capabilities: getConnectorCapabilities("slack"),
    oauthService: new SlackOAuthService(),
    clientService: new SlackClientService(),
    syncService: new SlackSyncService(),
  });

  registered = true;
}

export function resetDefaultConnectorsForTests(): void {
  registered = false;
}
