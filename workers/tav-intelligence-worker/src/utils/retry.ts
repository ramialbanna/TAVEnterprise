/**
 * Generic exponential-backoff retry helper with jitter.
 *
 * Pure utility — no I/O, no logger coupling. Callers pass `onRetry` if they
 * want to emit structured log lines per attempt.
 *
 * Backoff formula:
 *   delay = min(baseDelayMs * 2^(attempt-1), maxDelayMs)
 *   jitter = (Math.random() * 2 - 1) * jitterRatio    // ∈ [-jitterRatio, +jitterRatio]
 *   actualDelay = max(0, delay * (1 + jitter))
 *
 * Where `attempt` is the 1-indexed count of attempts already made (so the
 * delay BEFORE attempt 2 uses `attempt=1`).
 */

export interface RetryOptions {
  /** Total number of attempts including the first. Must be >= 1. */
  maxAttempts: number;
  /** Initial backoff delay before the second attempt, in milliseconds. */
  baseDelayMs: number;
  /** Hard ceiling on a single delay, in milliseconds. */
  maxDelayMs: number;
  /** Jitter band — `0` disables jitter; `0.3` means ±30%. */
  jitterRatio: number;
  /** Per-error decision. Returning `false` aborts retry and rethrows the error. */
  shouldRetry: (err: unknown, attempt: number) => boolean;
  /** Optional hook fired before each retry. Useful for logging. */
  onRetry?: (err: unknown, attempt: number, nextDelayMs: number) => void;
  /** Override sleep — handy in tests. Defaults to `setTimeout`-based. */
  sleep?: (ms: number) => Promise<void>;
  /** Override randomness — handy in tests. Defaults to `Math.random`. */
  random?: () => number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn` with exponential-backoff retry. Returns the resolved value on
 * success. Rethrows the most recent error after `maxAttempts` is exhausted
 * or when `shouldRetry` returns `false`.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  if (opts.maxAttempts < 1) {
    throw new Error("retryWithBackoff: maxAttempts must be >= 1");
  }

  const sleep  = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLastAttempt = attempt >= opts.maxAttempts;
      if (isLastAttempt || !opts.shouldRetry(err, attempt)) {
        throw err;
      }

      const exp     = Math.min(opts.baseDelayMs * 2 ** (attempt - 1), opts.maxDelayMs);
      const jitter  = (random() * 2 - 1) * opts.jitterRatio;
      const delayMs = Math.max(0, Math.floor(exp * (1 + jitter)));

      opts.onRetry?.(err, attempt, delayMs);
      await sleep(delayMs);
    }
  }

  // Unreachable — the loop always returns or throws — but keeps TS happy.
  throw lastErr;
}
