import { URLSearchParams } from "url";

export interface SlackChannel {
  id: string;
  name?: string;
  is_channel?: boolean;
  is_group?: boolean;
  is_im?: boolean;
  is_member?: boolean;
  is_private?: boolean;
  is_archived?: boolean;
}

export interface SlackMessage {
  type?: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  channel?: string;
  blocks?: Array<Record<string, unknown>>;
}

interface SlackApiResponse<T> {
  ok: boolean;
  error?: string;
  warning?: string;
  response_metadata?: {
    next_cursor?: string;
  };
  channels?: SlackChannel[];
  messages?: SlackMessage[];
  members?: string[];
  [key: string]: unknown;
  value?: T;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export class SlackClientService {
  private readonly baseUrl: string;

  constructor(opts?: { baseUrl?: string }) {
    this.baseUrl = opts?.baseUrl || "https://slack.com/api";
  }

  async authTest(accessToken: string): Promise<Record<string, unknown>> {
    return this.post("auth.test", accessToken, {});
  }

  async listConversations(input: {
    accessToken: string;
    types?: string[];
    excludeArchived?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<{ channels: SlackChannel[]; nextCursor?: string }> {
    const limit = Math.min(Math.max(input.limit ?? 200, 1), 1000);
    const payload = {
      types: (input.types ?? ["public_channel", "private_channel"]).join(","),
      exclude_archived: input.excludeArchived !== false,
      limit,
      ...(input.cursor ? { cursor: input.cursor } : {}),
    };

    const response = await this.post<SlackApiResponse<never>>(
      "conversations.list",
      input.accessToken,
      payload,
    );

    return {
      channels: (response.channels || []) as SlackChannel[],
      nextCursor: response.response_metadata?.next_cursor || undefined,
    };
  }

  async listConversationMembers(input: {
    accessToken: string;
    channelId: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ memberIds: string[]; nextCursor?: string }> {
    if (!asString(input.channelId)) throw new Error("channelId is required.");

    const response = await this.post<SlackApiResponse<never>>(
      "conversations.members",
      input.accessToken,
      {
        channel: input.channelId,
        limit: Math.min(Math.max(input.limit ?? 200, 1), 1000),
        ...(input.cursor ? { cursor: input.cursor } : {}),
      },
    );

    return {
      memberIds: (response.members || []) as string[],
      nextCursor: response.response_metadata?.next_cursor || undefined,
    };
  }

  async getConversationHistory(input: {
    accessToken: string;
    channelId: string;
    oldestTs?: string;
    latestTs?: string;
    inclusive?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<{ messages: SlackMessage[]; nextCursor?: string }> {
    if (!asString(input.channelId)) throw new Error("channelId is required.");

    const payload: Record<string, unknown> = {
      channel: input.channelId,
      limit: Math.min(Math.max(input.limit ?? 200, 1), 1000),
      inclusive: input.inclusive === true,
      ...(input.oldestTs ? { oldest: input.oldestTs } : {}),
      ...(input.latestTs ? { latest: input.latestTs } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
    };

    const response = await this.post<SlackApiResponse<never>>(
      "conversations.history",
      input.accessToken,
      payload,
    );

    return {
      messages: (response.messages || []) as SlackMessage[],
      nextCursor: response.response_metadata?.next_cursor || undefined,
    };
  }

  async getUserInfo(input: {
    accessToken: string;
    userId: string;
  }): Promise<Record<string, unknown>> {
    if (!asString(input.userId)) throw new Error("userId is required.");
    return this.get("users.info", input.accessToken, { user: input.userId });
  }

  extractMessageText(message: SlackMessage): string {
    const raw = asString(message.text) || "";
    if (raw.trim()) return this.normalizeSlackText(raw);

    const blockTexts: string[] = [];
    for (const block of message.blocks || []) {
      const text = block.text;
      if (text && typeof text === "object") {
        const v = asString((text as Record<string, unknown>).text);
        if (v) blockTexts.push(v);
      }
    }

    return this.normalizeSlackText(blockTexts.join(" ").trim());
  }

  private normalizeSlackText(input: string): string {
    return input
      .replace(/<@([A-Z0-9]+)>/g, "@$1")
      .replace(/<#([A-Z0-9]+)\|([^>]+)>/g, "#$2")
      .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
      .replace(/<([^>]+)>/g, "$1")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  private async get<T>(
    method: string,
    accessToken: string,
    query: Record<string, unknown>,
  ): Promise<T> {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      params.set(key, String(value));
    });

    const response = await fetch(
      `${this.baseUrl}/${method}?${params.toString()}`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json",
        },
      },
    );

    return this.parseResponse<T>(response, method);
  }

  private async post<T>(
    method: string,
    accessToken: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=utf-8",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    return this.parseResponse<T>(response, method);
  }

  private async parseResponse<T>(
    response: Response,
    method: string,
  ): Promise<T> {
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") || "1");
      const waitMs = Number.isFinite(retryAfter)
        ? Math.min(Math.max(retryAfter, 1) * 1000, 5000)
        : 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      throw new Error(`Slack API rate limited for ${method}. Retry request.`);
    }

    if (!response.ok) {
      const text = await response
        .text()
        .catch(() => "Slack API request failed");
      throw new Error(
        `Slack API ${method} failed (${response.status}): ${text.slice(0, 260)}`,
      );
    }

    const json = (await response.json()) as Record<string, unknown>;
    if (json.ok !== true) {
      throw new Error(
        `Slack API ${method} returned error: ${String(json.error || "unknown_error")}`,
      );
    }

    return json as T;
  }
}

export default SlackClientService;
