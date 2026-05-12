/**
 * Barrel for the /app-api layer — schemas, parser, code → human-copy map, and the
 * typed browser client. The server-side fetch (`server.ts`) is intentionally NOT
 * re-exported here — it imports "server-only" and must be imported directly from RSC
 * code (`@/lib/app-api/server`) so it can never be pulled into a client bundle via
 * this barrel.
 */
export * from "./schemas";
export * from "./parse";
export * from "./client";
export { codeMessage } from "./missing-reason";
