/**
 * Typed error hierarchy for tav-intelligence-worker.
 *
 * Every thrown error that crosses a handler boundary should be an
 * `IntelligenceError` so the top-level `fetch` catcher can convert it into a
 * standard `errorResponse` with the right HTTP status and `error.code`.
 *
 * Anything else that escapes is logged and returned as a generic 500 — we do
 * NOT leak unknown error messages to callers.
 */

export abstract class IntelligenceError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
  }
}

/** 400 — request body or path params failed Zod validation. */
export class ValidationError extends IntelligenceError {
  readonly code = "validation_error";
  readonly httpStatus = 400;
}

/** 401 — Cloudflare Access identity required and absent. */
export class AuthError extends IntelligenceError {
  readonly code = "auth_error";
  readonly httpStatus = 401;
}

/** 502 — upstream API (Manheim, etc.) returned a non-recoverable error. */
export class ExternalApiError extends IntelligenceError {
  readonly code = "external_api_error";
  readonly httpStatus = 502;
}

/** 503 — failed to acquire / wait on a cache lock; caller should retry. */
export class CacheLockError extends IntelligenceError {
  readonly code = "cache_lock_error";
  readonly httpStatus = 503;
}

/** 503 — Postgres / Supabase write or read failed after retries. */
export class PersistenceError extends IntelligenceError {
  readonly code = "persistence_error";
  readonly httpStatus = 503;
}
