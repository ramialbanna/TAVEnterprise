/**
 * Worker environment bindings for tav-intelligence-worker.
 *
 * Phase F.1 shipped KV + manager email allowlist.
 * Phase G.1 adds the six Manheim OAuth + MMR endpoint secrets needed to drive
 * `ManheimHttpClient`. Supabase bindings land in Phase G.2.
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

  /** Manheim OAuth client id (password-grant). Wrangler secret. */
  MANHEIM_CLIENT_ID: string;
  /** Manheim OAuth client secret. Wrangler secret. NEVER log this. */
  MANHEIM_CLIENT_SECRET: string;
  /** Manheim user account name. Wrangler secret. */
  MANHEIM_USERNAME: string;
  /** Manheim user account password. Wrangler secret. NEVER log this. */
  MANHEIM_PASSWORD: string;
  /** OAuth token endpoint, e.g. https://api.manheim.com/oauth2/token. */
  MANHEIM_TOKEN_URL: string;
  /** MMR base URL, e.g. https://api.manheim.com (no trailing slash). */
  MANHEIM_MMR_URL: string;

  /** Supabase project URL, e.g. https://<ref>.supabase.co. */
  SUPABASE_URL: string;
  /** Supabase service-role key. NEVER log this. */
  SUPABASE_SERVICE_ROLE_KEY: string;

  /**
   * Shared secret for worker-to-worker calls from the main tav-aip worker.
   * When non-empty, a request bearing x-tav-service-secret matching this value
   * is granted service identity (bypassing CF Access requirement).
   * Empty string disables the bypass. Set via: wrangler secret put INTEL_SERVICE_SECRET
   */
  INTEL_SERVICE_SECRET: string;
}
