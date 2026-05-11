/**
 * Human-readable copy for the string codes the dashboard receives:
 *   - `missingReason` values (on KPI/status metric blocks and on /app/mmr/vin),
 *   - Worker `/app/*` error codes (the `error` field of `{ ok:false, error }`),
 *   - `/web` proxy error codes (our Next layer between the browser and the Worker — NOT
 *     business errors from the Worker; `proxy_misconfigured` in particular is a Next/Vercel
 *     configuration problem, not anything wrong with `/app/*`).
 *
 * One map, one lookup. Unknown codes get a generic fallback.
 */
const CODE_MESSAGES: Record<string, string> = {
  // ── missingReason — staleSweep (GET /app/system-status) ──────────────────────
  never_run: "The daily stale sweep hasn't run yet (expected right after the migration, until the first scheduled run).",
  not_persisted: "Stale-sweep runs aren't being recorded yet.",

  // ── missingReason — KPI metric blocks (GET /app/kpis) ────────────────────────
  // (`db_error` is shared with the error codes below.)
  unavailable: "Not available.",
  not_implemented: "Not available yet — the backend metric hasn't been built.",

  // ── missingReason — POST /app/mmr/vin ────────────────────────────────────────
  intel_worker_not_configured: "MMR lookups aren't configured for this environment.",
  no_mmr_value: "No MMR value was returned for that vehicle (insufficient inputs or no match).",
  intel_worker_timeout: "The MMR service timed out — try again.",
  intel_worker_rate_limited: "The MMR service is rate-limited right now — try again shortly.",
  intel_worker_unavailable: "The MMR service is unavailable right now — try again shortly.",

  // ── Worker /app/* error codes ────────────────────────────────────────────────
  unauthorized: "Your session has expired — sign in again.",
  app_auth_not_configured: "The TAV API isn't configured for this environment (server-side). Contact the operator.",
  db_error: "The database is temporarily unavailable — try again.",
  internal_error: "The TAV API hit an unexpected error — try again.",
  not_found: "That endpoint doesn't exist (likely a dashboard bug).",
  invalid_json: "The request couldn't be read (malformed body).",
  invalid_body: "That request was rejected — check the highlighted fields.",

  // ── /web proxy error codes (the dashboard's own server layer, not the Worker) ─
  proxy_misconfigured:
    "The dashboard is misconfigured on the server side (a Next.js/Vercel environment problem — not a TAV API error). Contact the operator.",
  upstream_unavailable: "The dashboard couldn't reach the TAV API — try again.",
  upstream_non_json:
    "The TAV API gateway returned an unexpected (non-JSON) response — this is an infrastructure/proxy issue, not a data problem. Try again.",

  // ── parser-internal codes ────────────────────────────────────────────────────
  bad_response: "Unexpected response from the server.",
  schema_mismatch: "The server returned data in an unexpected shape.",
};

const GENERIC = "Not available.";

/** Map a code (missingReason / Worker error / proxy error / null) to display copy. */
export function codeMessage(code: string | null | undefined): string {
  if (!code) return GENERIC;
  return CODE_MESSAGES[code] ?? GENERIC;
}
