export interface StorageConfig {
  provider: 's3' | 'local';
  bucket?: string;
  region?: string;
  basePath?: string;
}

export interface UploadResult {
  key: string;
  url: string;
  size: number;
  mimeType: string;
}

export interface DownloadOptions {
  expiresIn?: number;
}
