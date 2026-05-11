/**
 * Barrel for the /app-api layer — schemas, parser, and code → human-copy map.
 * The typed browser client (`client.ts`) and the server-side fetch (`server.ts`)
 * are added in Task 1.11 and re-exported here.
 */
export * from "./schemas";
export * from "./parse";
export { codeMessage } from "./missing-reason";
