export type ConnectorIntent = 'CONNECTORS';

export type ConnectorProvider = 'gmail' | 'outlook' | 'slack';

export type ConnectorOperator =
  | 'CONNECT_START'
  | 'CONNECTOR_SYNC'
  | 'CONNECTOR_SEARCH'
  | 'CONNECTOR_STATUS'
  | 'CONNECTOR_DISCONNECT';

export type ConnectorScope = 'connectors';

export interface ConnectorRequestContext {
  correlationId: string;
  userId: string;
  conversationId: string;
  clientMessageId: string;
  requestId?: string;
}

export interface ConnectorsRoutingDecision {
  intent: ConnectorIntent;
  operator: ConnectorOperator;
  domain: 'connectors';
  scope: ConnectorScope;
  provider: ConnectorProvider | null;
  confidence: number;
  reasonCodes: string[];
  databanksUsed: string[];
}

export interface ConnectorTokenMetadata {
  userId: string;
  provider: ConnectorProvider;
  scopes: string[];
  expiresAt: string;
  refreshedAt?: string;
}

export interface ConnectorTokenRecord extends ConnectorTokenMetadata {
  encryptedBlob: string;
}

export interface OAuthStartResult {
  provider: ConnectorProvider;
  authUrl: string;
  state: string;
}

export interface OAuthCallbackResult {
  provider: ConnectorProvider;
  connected: boolean;
  expiresAt?: string;
  scopes?: string[];
}

export interface ConnectorStatus {
  provider: ConnectorProvider;
  connected: boolean;
  lastSyncAt?: string;
  cursor?: string;
  scopes?: string[];
}

export interface ConnectorStatusResponse {
  providers: ConnectorStatus[];
}

export interface ConnectorActor {
  id?: string;
  email?: string;
  displayName?: string;
}

export interface ConnectorDocument {
  sourceType: ConnectorProvider;
  sourceId: string;
  title: string;
  body: string;
  timestamp: string;
  actors: ConnectorActor[];
  labels?: string[];
  channel?: string;
  threadId?: string;
  sourceMeta: {
    messageId?: string;
    threadId?: string;
    channelId?: string;
    historyId?: string;
    conversationTs?: string;
    permalink?: string;
  };
}

export interface ConnectorCitation {
  sourceType: ConnectorProvider;
  sourceId: string;
  timestamp: string;
  subject?: string;
  threadId?: string;
  channel?: string;
  actor?: string;
}

export interface ConnectorIngestionResult {
  provider: ConnectorProvider;
  totalFetched: number;
  totalIngested: number;
  totalSkipped: number;
  cursor?: string;
  reasonCodes: string[];
}

export interface ConnectorSyncRequest {
  provider: ConnectorProvider;
  cursor?: string;
  backfillDays?: number;
  limit?: number;
}

export interface ConnectorSyncJobPayload {
  userId: string;
  provider: ConnectorProvider;
  cursor?: string;
  backfillDays?: number;
}

export interface ConnectorSyncCursor {
  provider: ConnectorProvider;
  userId: string;
  cursor: string;
  updatedAt: string;
}

export interface ConnectorPolicyLimits {
  maxItemsPerSyncJob: number;
  maxBackfillDays: number;
  maxIncrementalLagDays: number;
  maxJobsPerUserPerHour: number;
}

export interface ConnectorSearchRequest {
  provider?: ConnectorProvider;
  query: string;
  limit?: number;
  from?: string;
  to?: string;
}

export interface ConnectorSearchResultItem {
  citation: ConnectorCitation;
  snippet: string;
  score: number;
}

export interface ConnectorSearchResult {
  query: string;
  total: number;
  items: ConnectorSearchResultItem[];
  reasonCodes: string[];
}
