import * as crypto from "crypto";
import type { slides_v1 } from "googleapis";
import {
  SlidesClientError,
  SlidesClientService,
  type SlidesRequestContext,
} from "./slidesClient.service";

export interface SlidesAssetMeta {
  prompt?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  provider?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface SlidesAssetRecord {
  id: string;
  userId: string;
  url: string;
  sourceHash: string;
  createdAt: Date;
  updatedAt: Date;
  meta: SlidesAssetMeta;
  attachments: SlidesAssetAttachment[];
}

export interface SlidesAssetAttachment {
  presentationId: string;
  slideObjectId: string;
  imageObjectId?: string;
  attachedAt: Date;
}

export interface SlidesAssetRepository {
  create(
    record: Omit<SlidesAssetRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<SlidesAssetRecord>;
  appendAttachment(
    assetId: string,
    attachment: SlidesAssetAttachment,
  ): Promise<SlidesAssetRecord>;
  getById(assetId: string): Promise<SlidesAssetRecord | null>;
}

export interface AttachAssetInput {
  assetId: string;
  presentationId: string;
  slideObjectId: string;
  imageObjectId?: string;
  transform?: {
    scaleX?: number;
    scaleY?: number;
    translateX?: number;
    translateY?: number;
    unit?: "PT" | "EMU";
  };
}

export interface AttachAssetResult {
  asset: SlidesAssetRecord;
  imageObjectId: string;
}

class InMemorySlidesAssetRepository implements SlidesAssetRepository {
  private readonly records = new Map<string, SlidesAssetRecord>();

  async create(
    record: Omit<SlidesAssetRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<SlidesAssetRecord> {
    const now = new Date();
    const id = `asset_${crypto.randomUUID()}`;

    const next: SlidesAssetRecord = {
      ...record,
      id,
      createdAt: now,
      updatedAt: now,
      attachments: [...record.attachments],
    };

    this.records.set(id, next);
    return next;
  }

  async appendAttachment(
    assetId: string,
    attachment: SlidesAssetAttachment,
  ): Promise<SlidesAssetRecord> {
    const existing = this.records.get(assetId);
    if (!existing) {
      throw new SlidesClientError(`Asset not found: ${assetId}`, {
        code: "ASSET_NOT_FOUND",
        retryable: false,
      });
    }

    const next: SlidesAssetRecord = {
      ...existing,
      updatedAt: new Date(),
      attachments: [...existing.attachments, attachment],
    };

    this.records.set(assetId, next);
    return next;
  }

  async getById(assetId: string): Promise<SlidesAssetRecord | null> {
    return this.records.get(assetId) ?? null;
  }
}

function ensureHttpsUrl(url: string): string {
  const normalized = url.trim();
  if (!/^https:\/\//i.test(normalized)) {
    throw new SlidesClientError("Asset URL must be an HTTPS URL.", {
      code: "INVALID_ASSET_URL",
      retryable: false,
    });
  }
  return normalized;
}

function objectId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Asset catalog + attachment service for generated slide media.
 */
export class SlidesAssetsService {
  constructor(
    private readonly repository: SlidesAssetRepository = new InMemorySlidesAssetRepository(),
    private readonly slidesClient: SlidesClientService = new SlidesClientService(),
  ) {}

  async createAssetRecord(
    userId: string,
    url: string,
    meta: SlidesAssetMeta = {},
  ): Promise<SlidesAssetRecord> {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      throw new SlidesClientError("userId is required for asset creation.", {
        code: "INVALID_USER_ID",
        retryable: false,
      });
    }

    const normalizedUrl = ensureHttpsUrl(url);
    const sourceHash = crypto
      .createHash("sha256")
      .update(normalizedUrl)
      .digest("hex");

    return this.repository.create({
      userId: normalizedUserId,
      url: normalizedUrl,
      sourceHash,
      meta,
      attachments: [],
    });
  }

  async attachAssetToSlide(
    input: AttachAssetInput,
    ctx?: SlidesRequestContext,
  ): Promise<AttachAssetResult> {
    const asset = await this.repository.getById(input.assetId);
    if (!asset) {
      throw new SlidesClientError(`Asset not found: ${input.assetId}`, {
        code: "ASSET_NOT_FOUND",
        retryable: false,
      });
    }

    const presentationId = input.presentationId.trim();
    const slideObjectId = input.slideObjectId.trim();

    if (!presentationId || !slideObjectId) {
      throw new SlidesClientError(
        "presentationId and slideObjectId are required.",
        {
          code: "INVALID_ATTACHMENT_TARGET",
          retryable: false,
        },
      );
    }

    const imageObjectId = input.imageObjectId?.trim() || objectId("img");

    const createRequest: slides_v1.Schema$Request = {
      createImage: {
        objectId: imageObjectId,
        url: asset.url,
        elementProperties: {
          pageObjectId: slideObjectId,
          transform: {
            scaleX: input.transform?.scaleX ?? 1,
            scaleY: input.transform?.scaleY ?? 1,
            translateX: input.transform?.translateX ?? 40,
            translateY: input.transform?.translateY ?? 90,
            unit: input.transform?.unit ?? "PT",
          },
        },
      },
    };

    await this.slidesClient.batchUpdate(presentationId, [createRequest], ctx);

    const updated = await this.repository.appendAttachment(input.assetId, {
      presentationId,
      slideObjectId,
      imageObjectId,
      attachedAt: new Date(),
    });

    return {
      asset: updated,
      imageObjectId,
    };
  }
}

export default SlidesAssetsService;
