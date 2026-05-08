/**
 * Generate a per-request correlation ID stamped on every log line and
 * response envelope.
 *
 * Cloudflare Workers expose `crypto.randomUUID()` natively (no polyfill
 * required).
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}
