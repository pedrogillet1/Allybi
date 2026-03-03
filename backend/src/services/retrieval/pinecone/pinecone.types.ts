export type Primitive = string | number | boolean;
export type PineconeMetadataValue = Primitive | Primitive[];
export type PineconeMetadata = Record<string, PineconeMetadataValue>;
export type PineconeFilter = Record<string, unknown>;

export interface PineconeVector {
  id: string;
  values: number[];
  metadata?: PineconeMetadata;
}

export interface PineconeQueryParams {
  vector: number[];
  topK: number;
  includeMetadata: boolean;
  filter?: PineconeFilter;
}

export interface PineconeQueryMatch {
  id?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface PineconeQueryResult {
  matches?: PineconeQueryMatch[];
}

export interface PineconeIndexClient {
  upsert(vectors: PineconeVector[]): Promise<unknown>;
  query(params: PineconeQueryParams): Promise<PineconeQueryResult>;
  deleteMany(ids: string[]): Promise<unknown>;
  describeIndexStats(): Promise<unknown>;
}
