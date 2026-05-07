/**
 * Structured JSON logger. Mirrors src/logging/logger.ts in the main worker.
 *
 * Every log line is one JSON object that always includes `event`, a
 * `requestId` for correlation, and any caller-supplied fields.
 *
 * `console.log` is intentionally allowed only inside this module (the eslint
 * rule is suppressed below). All other code calls `log()` instead.
 */

export interface LogFields {
  requestId: string;
  [key: string]: unknown;
}

export function log(event: string, fields: LogFields): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ event, ...fields }));
}
