/**
 * Worker environment bindings for tav-intelligence-worker.
 *
 * Phase F.1 ships only KV + the manager email allowlist. Supabase and Manheim
 * bindings land in Phase G.
 */
export interface Env {
  TAV_INTEL_KV: KVNamespace;

  /**
   * Comma-separated list of emails permitted to call `force_refresh: true`
   * even when the user does not carry the `manager` role. Empty string means
   * no email-based bypass.
   *
   * Temporary — removed once `tav.user_roles` exists.
   * See docs/INTELLIGENCE_CONTRACTS.md §D.
   */
  MANAGER_EMAIL_ALLOWLIST: string;

  // Future (Phase G): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  // MANHEIM_CLIENT_ID, MANHEIM_CLIENT_SECRET, MANHEIM_TOKEN_URL,
  // MANHEIM_API_BASE_URL.
}
