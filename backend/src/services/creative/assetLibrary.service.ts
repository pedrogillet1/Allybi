import * as crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";

export interface AssetLibraryRecord {
  id: string;
  userId: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  storagePath: string;
  sha256: string;
  thumbnailPath?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface StoreAssetInput {
  userId: string;
  buffer: Buffer;
  mimeType: "image/png" | "image/webp";
  width: number;
  height: number;
  sha256?: string;
  thumbnailBuffer?: Buffer;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface AssetLibraryListFilter {
  tag?: string;
  limit?: number;
}

const DEFAULT_ROOT = path.resolve(
  process.cwd(),
  "storage",
  "creative",
  "assets",
);

function extFromMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function metadataPath(root: string, userId: string): string {
  return path.join(root, userId, "index.json");
}

/**
 * File-backed creative asset library.
 */
export class AssetLibraryService {
  constructor(private readonly root: string = DEFAULT_ROOT) {}

  async store(input: StoreAssetInput): Promise<AssetLibraryRecord> {
    const userId = input.userId.trim();
    if (!userId) {
      throw new Error("userId is required for asset storage.");
    }

    if (!Buffer.isBuffer(input.buffer) || input.buffer.length === 0) {
      throw new Error("Asset buffer is required.");
    }

    const now = new Date();
    const id = `asset_${crypto.randomUUID()}`;
    const ext = extFromMime(input.mimeType);
    const relativeDir = path.join(userId, now.toISOString().slice(0, 10));
    const absoluteDir = path.join(this.root, relativeDir);

    await fs.mkdir(absoluteDir, { recursive: true });

    const storagePath = path.join(relativeDir, `${id}.${ext}`);
    const absoluteAssetPath = path.join(this.root, storagePath);
    await fs.writeFile(absoluteAssetPath, input.buffer, { mode: 0o600 });

    let thumbnailPath: string | undefined;
    if (input.thumbnailBuffer && input.thumbnailBuffer.length > 0) {
      thumbnailPath = path.join(relativeDir, `${id}.thumb.webp`);
      await fs.writeFile(
        path.join(this.root, thumbnailPath),
        input.thumbnailBuffer,
        { mode: 0o600 },
      );
    }

    const record: AssetLibraryRecord = {
      id,
      userId,
      mimeType: input.mimeType,
      width: input.width,
      height: input.height,
      byteSize: input.buffer.length,
      storagePath,
      sha256: input.sha256 || sha256(input.buffer),
      thumbnailPath,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
      createdAt: now.toISOString(),
    };

    const existing = await this.readIndex(userId);
    existing.unshift(record);
    await this.writeIndex(userId, existing);

    return record;
  }

  async getById(
    userId: string,
    assetId: string,
  ): Promise<AssetLibraryRecord | null> {
    const records = await this.readIndex(userId);
    return records.find((record) => record.id === assetId) ?? null;
  }

  async list(
    userId: string,
    filter: AssetLibraryListFilter = {},
  ): Promise<AssetLibraryRecord[]> {
    const records = await this.readIndex(userId);
    const filtered = records.filter((record) => {
      if (!filter.tag) return true;
      return (record.tags ?? []).includes(filter.tag);
    });

    const limit = Math.max(1, Math.min(filter.limit ?? 50, 500));
    return filtered.slice(0, limit);
  }

  private async readIndex(userId: string): Promise<AssetLibraryRecord[]> {
    const filePath = metadataPath(this.root, userId);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as AssetLibraryRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async writeIndex(
    userId: string,
    records: AssetLibraryRecord[],
  ): Promise<void> {
    const filePath = metadataPath(this.root, userId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(records), {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(tempPath, filePath);
  }
}

export default AssetLibraryService;
