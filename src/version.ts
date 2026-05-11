/**
 * Single source of truth for the deployed Worker version string.
 * Lives in its own module so route handlers (e.g. GET /app/system-status,
 * GET /health) can read it without importing src/index.ts (circular).
 */
export const VERSION = "0.1.0";
