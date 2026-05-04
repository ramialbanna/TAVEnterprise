export class RetryExhaustedError extends Error {
  constructor(
    readonly attempts: number,
    readonly lastError: unknown,
  ) {
    super(`Exhausted after ${attempts} attempt(s)`);
    this.name = "RetryExhaustedError";
  }
}

// Postgres error codes that represent caller errors — do not retry.
const NON_RETRYABLE_PG_CODES = new Set([
  "23505", // unique_violation
  "23514", // check_violation
  "23502", // not_null_violation
  "23503", // foreign_key_violation
  "42501", // insufficient_privilege
]);

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delays: readonly number[] = [250, 1000, 4000],
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) {
        throw err;
      }
      if (attempt < maxAttempts) {
        await sleep(delayAt(delays, attempt));
      }
    }
  }

  throw new RetryExhaustedError(maxAttempts, lastError);
}

function isRetryable(err: unknown): boolean {
  // Network / fetch failures are always retryable.
  if (err instanceof TypeError) return true;

  // PostgREST / Postgres errors: check the error code.
  if (isErrorWithCode(err)) {
    return !NON_RETRYABLE_PG_CODES.has(err.code);
  }

  return true;
}

function isErrorWithCode(err: unknown): err is { code: string; message: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as Record<string, unknown>).code === "string"
  );
}

function delayAt(delays: readonly number[], attempt: number): number {
  const idx = Math.min(attempt - 1, delays.length - 1);
  return delays[idx] ?? 4000;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
