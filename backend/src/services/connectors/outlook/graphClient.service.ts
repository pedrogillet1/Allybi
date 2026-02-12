import { URLSearchParams } from 'url';

export interface GraphRequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  retryOnRateLimit?: boolean;
}

export interface GraphListMessagesInput {
  accessToken: string;
  top?: number;
  skip?: number;
  sinceIso?: string;
  folder?: 'Inbox' | 'SentItems' | 'Archive' | string;
  selectFields?: string[];
}

export interface GraphMessageItem {
  id: string;
  subject?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  bodyPreview?: string;
  body?: {
    contentType?: string;
    content?: string;
  };
  from?: {
    emailAddress?: { name?: string; address?: string };
  };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  conversationId?: string;
  webLink?: string;
  categories?: string[];
  internetMessageId?: string;
  lastModifiedDateTime?: string;
}

export interface GraphMailFolder {
  id: string;
  displayName: string;
  parentFolderId?: string;
  childFolderCount?: number;
  totalItemCount?: number;
  unreadItemCount?: number;
}

export interface GraphAttachmentItem {
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
  contentBytes?: string; // present when fetching a specific file attachment
  '@odata.type'?: string;
}

interface GraphListResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

function ensureToken(accessToken: string): void {
  if (!accessToken || !accessToken.trim()) {
    throw new Error('Graph access token is required.');
  }
}

function stripHtml(input: string): string {
  const raw = input || '';

  // Preserve basic structure before stripping tags.
  let t = raw
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '');

  // Decode a few common entities (best-effort).
  t = t
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  // Normalize whitespace but keep line breaks.
  t = t
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // If stripping removed everything, fall back to a single-line collapse.
  if (!t) {
    return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return t;
}

export class GraphClientService {
  private readonly baseUrl: string;

  constructor(opts?: { baseUrl?: string }) {
    this.baseUrl = opts?.baseUrl || 'https://graph.microsoft.com/v1.0';
  }

  async getMe(accessToken: string): Promise<Record<string, unknown>> {
    ensureToken(accessToken);
    return this.request<Record<string, unknown>>(accessToken, '/me', {
      query: { $select: 'id,displayName,userPrincipalName,mail' },
    });
  }

  async listMessages(input: GraphListMessagesInput): Promise<GraphListResponse<GraphMessageItem>> {
    ensureToken(input.accessToken);

    const top = Math.min(Math.max(input.top ?? 50, 1), 200);
    const select = (input.selectFields && input.selectFields.length > 0)
      ? input.selectFields.join(',')
      : [
          'id',
          'subject',
          'receivedDateTime',
          'sentDateTime',
          'bodyPreview',
          'body',
          'from',
          'toRecipients',
          'ccRecipients',
          'conversationId',
          'webLink',
          'categories',
          'internetMessageId',
          'lastModifiedDateTime',
        ].join(',');

    const filters: string[] = [];
    if (input.sinceIso) {
      filters.push(`receivedDateTime ge ${input.sinceIso}`);
    }

    const folder = input.folder || 'Inbox';
    const path = `/me/mailFolders/${encodeURIComponent(folder)}/messages`;

    return this.request<GraphListResponse<GraphMessageItem>>(input.accessToken, path, {
      query: {
        $top: top,
        $skip: input.skip ?? 0,
        $select: select,
        $orderby: 'receivedDateTime desc',
        ...(filters.length > 0 ? { $filter: filters.join(' and ') } : {}),
      },
      retryOnRateLimit: true,
    });
  }

  async getMessagesByNextLink(accessToken: string, nextLink: string): Promise<GraphListResponse<GraphMessageItem>> {
    ensureToken(accessToken);
    if (!nextLink || !nextLink.trim()) {
      throw new Error('nextLink is required.');
    }
    return this.requestAbsolute<GraphListResponse<GraphMessageItem>>(accessToken, nextLink, { retryOnRateLimit: true });
  }

  async listMailFolders(accessToken: string): Promise<GraphMailFolder[]> {
    ensureToken(accessToken);
    const folders: GraphMailFolder[] = [];

    let response = await this.request<GraphListResponse<GraphMailFolder>>(accessToken, '/me/mailFolders', {
      query: { $top: 100, $select: 'id,displayName,parentFolderId,childFolderCount,totalItemCount' },
      retryOnRateLimit: true,
    });

    folders.push(...(response.value || []));

    while (response['@odata.nextLink']) {
      response = await this.requestAbsolute<GraphListResponse<GraphMailFolder>>(
        accessToken,
        response['@odata.nextLink'],
        { retryOnRateLimit: true },
      );
      folders.push(...(response.value || []));
    }

    return folders;
  }

  async listAllMessages(input: {
    accessToken: string;
    folder: string;
    sinceIso?: string;
  }): Promise<GraphMessageItem[]> {
    const all: GraphMessageItem[] = [];

    let response = await this.listMessages({
      accessToken: input.accessToken,
      top: 200,
      sinceIso: input.sinceIso,
      folder: input.folder,
    });

    all.push(...(response.value || []));

    while (response['@odata.nextLink']) {
      response = await this.getMessagesByNextLink(input.accessToken, response['@odata.nextLink']);
      all.push(...(response.value || []));
    }

    return all;
  }

  async getMessage(accessToken: string, messageId: string): Promise<GraphMessageItem> {
    ensureToken(accessToken);
    if (!messageId || !messageId.trim()) throw new Error('messageId is required.');

    return this.request<GraphMessageItem>(accessToken, `/me/messages/${encodeURIComponent(messageId)}`, {
      query: {
        $select:
          'id,subject,receivedDateTime,sentDateTime,bodyPreview,body,from,toRecipients,ccRecipients,conversationId,webLink,categories,internetMessageId,lastModifiedDateTime',
      },
      retryOnRateLimit: true,
    });
  }

  async listMessageAttachments(accessToken: string, messageId: string): Promise<GraphAttachmentItem[]> {
    ensureToken(accessToken);
    if (!messageId || !messageId.trim()) throw new Error('messageId is required.');
    const response = await this.request<GraphListResponse<GraphAttachmentItem>>(
      accessToken,
      `/me/messages/${encodeURIComponent(messageId)}/attachments`,
      { query: { $select: 'id,name,contentType,size,isInline,@odata.type' }, retryOnRateLimit: true },
    );
    return Array.isArray(response?.value) ? response.value : [];
  }

  async getMessageAttachment(accessToken: string, messageId: string, attachmentId: string): Promise<GraphAttachmentItem> {
    ensureToken(accessToken);
    if (!messageId || !messageId.trim()) throw new Error('messageId is required.');
    if (!attachmentId || !attachmentId.trim()) throw new Error('attachmentId is required.');
    return this.request<GraphAttachmentItem>(
      accessToken,
      `/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { retryOnRateLimit: true },
    );
  }

  getMessageText(message: GraphMessageItem): string {
    const bodyContent = message.body?.content || '';
    const bodyType = (message.body?.contentType || '').toLowerCase();

    const cleanedBody =
      bodyType === 'html'
        ? stripHtml(bodyContent)
        : bodyContent.replace(/\s+/g, ' ').trim();

    const preview = message.bodyPreview || '';
    if (cleanedBody.length >= 40) return cleanedBody;
    return preview.trim();
  }

  async sendMessage(
    accessToken: string,
    params: {
      to: string;
      subject: string;
      body: string;
      cc?: string;
      bcc?: string;
      attachments?: Array<{ filename: string; mimeType: string; content: Buffer }>;
    },
  ): Promise<Record<string, unknown>> {
    ensureToken(accessToken);
    if (!params.to?.trim()) throw new Error('"to" address is required.');

    const toRecipients = params.to.split(/[;,]/).map(addr => ({
      emailAddress: { address: addr.trim() },
    }));

    const ccRecipients = params.cc
      ? params.cc.split(/[;,]/).map(addr => ({ emailAddress: { address: addr.trim() } }))
      : undefined;

    const bccRecipients = params.bcc
      ? params.bcc.split(/[;,]/).map(addr => ({ emailAddress: { address: addr.trim() } }))
      : undefined;

    const payload: Record<string, unknown> = {
      message: {
        subject: params.subject || '(no subject)',
        body: { contentType: 'Text', content: params.body || '' },
        toRecipients,
        ...(ccRecipients ? { ccRecipients } : {}),
        ...(bccRecipients ? { bccRecipients } : {}),
        ...(Array.isArray(params.attachments) && params.attachments.length
          ? {
              attachments: params.attachments.map((a) => ({
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: String(a?.filename || 'attachment'),
                contentType: String(a?.mimeType || 'application/octet-stream'),
                contentBytes: Buffer.from(a?.content || Buffer.alloc(0)).toString('base64'),
              })),
            }
          : {}),
      },
      saveToSentItems: true,
    };

    return this.requestWithBody<Record<string, unknown>>(accessToken, '/me/sendMail', payload);
  }

  private async requestWithBody<T>(
    accessToken: string,
    path: string,
    body: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    // Graph sendMail returns 202 Accepted with no body
    if (response.status === 202 || response.status === 204) {
      return {} as T;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => 'Graph POST request failed');
      throw new Error(`Graph POST failed (${response.status}): ${text.slice(0, 280)}`);
    }

    return (await response.json()) as T;
  }

  private async request<T>(
    accessToken: string,
    path: string,
    options?: GraphRequestOptions,
  ): Promise<T> {
    const params = new URLSearchParams();
    Object.entries(options?.query || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      params.set(key, String(value));
    });

    const url = `${this.baseUrl}${path}${params.toString() ? `?${params.toString()}` : ''}`;
    return this.requestAbsolute<T>(accessToken, url, options);
  }

  private async requestAbsolute<T>(
    accessToken: string,
    url: string,
    options?: GraphRequestOptions,
  ): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      ...options?.headers,
    };

    const doFetch = async (): Promise<Response> => fetch(url, { method: 'GET', headers });

    let response = await doFetch();

    if ((response.status === 429 || response.status === 503) && options?.retryOnRateLimit !== false) {
      const retryAfter = Number(response.headers.get('retry-after') || '1');
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000;
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 5000)));
      response = await doFetch();
    }

    if (!response.ok) {
      const text = await response.text().catch(() => 'Graph request failed');
      throw new Error(`Graph request failed (${response.status}): ${text.slice(0, 280)}`);
    }

    return (await response.json()) as T;
  }
}

export default GraphClientService;
