// ── Errors ──
export {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  AIServiceError,
  OCRError,
} from './errors/errors';

export type { EnvName as HttpEnvName, ErrorCode, ApiErrorEnvelope, ApiOk } from './errors/httpErrors';
export { ApiError, Errors } from './errors/httpErrors';

// ── Logging ──
export { logger, performanceConsole, isLoggingEnabled, logIfEnabled } from './logging/logger';
export { secureLogsMiddleware } from './logging/requestLogger.middleware';

// ── Text ──
export { truncate, slugify, capitalize, normalizeWhitespace } from './text/stringUtils';

// ── Types ──
export type {
  ISODateString,
  LanguageCode,
  EnvName,
  UUID,
  ID,
  Dict,
  Maybe,
  OneOrMany,
  PaginationInput,
  PaginationOutput,
  SortDirection,
  SortInput,
  Result,
  ServiceErrorShape,
  HttpMethod,
  TraceContext,
  WithTrace,
  Confidence,
} from './types/common.types';
export { ServiceError, clamp01, isRecord, isNonEmptyString } from './types/common.types';

export type { Result as ResultT } from './types/result.types';
export { ok, err } from './types/result.types';

// ── Utils ──
export { assert, assertNonNull } from './utils/assert';
export type { HashAlgo, HashOptions } from './utils/hash';
export { hash, sha256, sha512, hmacSha256, makeCacheKey, timingSafeEqualHex } from './utils/hash';
export { KodaMarkerGeneratorService } from './utils/id';
export type { RetryOptions } from './utils/timing';
export { retryWithBackoff, retryStreamingWithBackoff } from './utils/timing';

// ── Validation ──
export * from './validation/zod';
