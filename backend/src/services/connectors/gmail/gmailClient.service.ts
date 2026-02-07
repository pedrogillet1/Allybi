import { google, gmail_v1 } from 'googleapis';

export interface GmailRequestContext {
  correlationId?: string;
  userId?: string;
  conversationId?: string;
  clientMessageId?: string;
}

export interface GmailClientOptions {
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export class GmailClientError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly status?: number;

  constructor(message: string, opts: { code: string; retryable: boolean; status?: number }) {
    super(message);
    this.name = 'GmailClientError';
    this.code = opts.code;
    this.retryable = opts.retryable;
    this.status = opts.status;
  }
}

const DEFAULT_OPTIONS: Required<GmailClientOptions> = {
  maxRetries: 3,
  baseBackoffMs: 300,
  maxBackoffMs: 4000,
};

/**
 * Thin Gmail API wrapper with typed error mapping and retry/backoff.
 */
export class GmailClientService {
  private readonly options: Required<GmailClientOptions>;

  constructor(options?: GmailClientOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
  }

  async getProfile(
    accessToken: string,
    _ctx?: GmailRequestContext,
  ): Promise<gmail_v1.Schema$Profile> {
    this.assertToken(accessToken);
    const client = this.createClient(accessToken);

    return this.withRetry(async () => {
      const response = await client.users.getProfile({ userId: 'me' });
      if (!response.data) {
        throw new GmailClientError('Gmail profile payload is empty.', {
          code: 'EMPTY_PROFILE_PAYLOAD',
          retryable: false,
        });
      }
      return response.data;
    });
  }

  async listMessages(
    accessToken: string,
    params: {
      q?: string;
      labelIds?: string[];
      maxResults?: number;
      pageToken?: string;
      includeSpamTrash?: boolean;
    },
    _ctx?: GmailRequestContext,
  ): Promise<gmail_v1.Schema$ListMessagesResponse> {
    this.assertToken(accessToken);
    const client = this.createClient(accessToken);

    return this.withRetry(async () => {
      const response = await client.users.messages.list({
        userId: 'me',
        q: params.q,
        labelIds: params.labelIds,
        maxResults: params.maxResults,
        pageToken: params.pageToken,
        includeSpamTrash: params.includeSpamTrash,
      });

      return response.data ?? {};
    });
  }

  async getMessage(
    accessToken: string,
    messageId: string,
    _ctx?: GmailRequestContext,
  ): Promise<gmail_v1.Schema$Message> {
    this.assertToken(accessToken);
    if (!messageId.trim()) {
      throw new GmailClientError('messageId is required.', {
        code: 'INVALID_MESSAGE_ID',
        retryable: false,
      });
    }

    const client = this.createClient(accessToken);

    return this.withRetry(async () => {
      const response = await client.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      if (!response.data) {
        throw new GmailClientError(`Gmail returned empty message payload for ${messageId}.`, {
          code: 'EMPTY_MESSAGE_PAYLOAD',
          retryable: false,
        });
      }

      return response.data;
    });
  }

  async listHistory(
    accessToken: string,
    params: {
      startHistoryId: string;
      historyTypes?: Array<'messageAdded' | 'messageDeleted' | 'labelAdded' | 'labelRemoved'>;
      maxResults?: number;
      pageToken?: string;
    },
    _ctx?: GmailRequestContext,
  ): Promise<gmail_v1.Schema$ListHistoryResponse> {
    this.assertToken(accessToken);

    if (!params.startHistoryId?.trim()) {
      throw new GmailClientError('startHistoryId is required for Gmail history listing.', {
        code: 'INVALID_HISTORY_CURSOR',
        retryable: false,
      });
    }

    const client = this.createClient(accessToken);

    return this.withRetry(async () => {
      const response = await client.users.history.list({
        userId: 'me',
        startHistoryId: params.startHistoryId,
        historyTypes: params.historyTypes,
        maxResults: params.maxResults,
        pageToken: params.pageToken,
      });

      return response.data ?? {};
    });
  }

  private createClient(accessToken: string): gmail_v1.Gmail {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.gmail({ version: 'v1', auth });
  }

  private assertToken(accessToken: string): void {
    if (!accessToken || !accessToken.trim()) {
      throw new GmailClientError('A valid Gmail access token is required.', {
        code: 'INVALID_ACCESS_TOKEN',
        retryable: false,
      });
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.options.maxRetries) {
      attempt += 1;
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const mapped = this.mapError(error);
        const isLast = attempt > this.options.maxRetries;

        if (!mapped.retryable || isLast) {
          throw mapped;
        }

        const wait = Math.min(
          this.options.maxBackoffMs,
          this.options.baseBackoffMs * Math.pow(2, Math.max(0, attempt - 1)) + Math.floor(Math.random() * 100),
        );

        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }

    throw this.mapError(lastError);
  }

  private mapError(error: unknown): GmailClientError {
    if (error instanceof GmailClientError) return error;

    const e = error as {
      message?: string;
      code?: string | number;
      status?: number;
      response?: { status?: number; data?: { error?: { message?: string } } };
      errors?: Array<{ reason?: string; message?: string }>;
    };

    const status = e?.status ?? e?.response?.status;
    const code = String(e?.code ?? 'UNKNOWN');
    const message =
      e?.response?.data?.error?.message ||
      e?.errors?.[0]?.message ||
      e?.message ||
      'Unknown Gmail API error';

    if (status === 401 || status === 403) {
      return new GmailClientError('Gmail auth failed. Reconnect may be required.', {
        code: 'AUTH_ERROR',
        retryable: false,
        status,
      });
    }

    if (status === 404) {
      return new GmailClientError(message, {
        code: 'NOT_FOUND',
        retryable: false,
        status,
      });
    }

    if (status === 400 && /history/i.test(message)) {
      return new GmailClientError(message, {
        code: 'INVALID_HISTORY_CURSOR',
        retryable: false,
        status,
      });
    }

    if ([408, 429, 500, 502, 503, 504].includes(status ?? -1)) {
      return new GmailClientError(message, {
        code: 'TRANSIENT_API_ERROR',
        retryable: true,
        status,
      });
    }

    if (['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'].includes(code)) {
      return new GmailClientError(message, {
        code: 'NETWORK_ERROR',
        retryable: true,
      });
    }

    return new GmailClientError(message, {
      code: 'API_ERROR',
      retryable: false,
      status,
    });
  }
}

export default GmailClientService;
