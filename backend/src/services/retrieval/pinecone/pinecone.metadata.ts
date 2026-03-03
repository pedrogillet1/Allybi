import type {
  PineconeMetadata,
  Primitive,
} from "./pinecone.types";

export function toIsoString(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  return value.toISOString();
}

export function hasNonZeroVector(vector: number[]): boolean {
  return vector.some((value) => value !== 0);
}

export function makeVectorId(documentId: string, chunkIndex: number): string {
  return `${documentId}:${chunkIndex}`;
}

export function sanitizePineconeMetadata(
  input: Record<string, unknown>,
  maxJsonChars = 2000,
): PineconeMetadata {
  const output: PineconeMetadata = {};

  for (const [key, value] of Object.entries(input || {})) {
    if (value == null) continue;

    const t = typeof value;
    if (t === "string" || t === "number" || t === "boolean") {
      output[key] = value as Primitive;
      continue;
    }

    if (Array.isArray(value)) {
      if (
        value.every(
          (entry) =>
            typeof entry === "string" ||
            typeof entry === "number" ||
            typeof entry === "boolean",
        )
      ) {
        output[key] = value as Primitive[];
      } else {
        output[key] = JSON.stringify(value).slice(0, maxJsonChars);
      }
      continue;
    }

    try {
      output[key] = JSON.stringify(value).slice(0, maxJsonChars);
    } catch {
      // ignore unserializable metadata
    }
  }

  return output;
}
