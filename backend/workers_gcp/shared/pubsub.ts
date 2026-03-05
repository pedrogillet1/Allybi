interface PubSubMessage {
  data?: string;
  messageId?: string;
  attributes?: Record<string, string>;
}

interface PubSubEnvelope {
  message?: PubSubMessage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isValidPubSubEnvelope(body: unknown): body is PubSubEnvelope {
  if (!isRecord(body)) return false;
  const message = body.message;
  return isRecord(message) && typeof message.data === "string";
}

export function decodePubSubMessage<T>(body: unknown): {
  messageId: string | null;
  attributes: Record<string, string>;
  data: T;
} {
  if (!isValidPubSubEnvelope(body)) {
    throw new Error("Invalid Pub/Sub envelope");
  }

  const encoded = body.message?.data || "";
  if (!encoded) {
    throw new Error("Pub/Sub message has empty data payload");
  }

  let parsed: unknown;
  try {
    const json = Buffer.from(encoded, "base64").toString("utf8");
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(
      `Failed to decode Pub/Sub message: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const attributes = isRecord(body.message?.attributes)
    ? (body.message?.attributes as Record<string, string>)
    : {};

  return {
    messageId: body.message?.messageId || null,
    attributes,
    data: parsed as T,
  };
}
