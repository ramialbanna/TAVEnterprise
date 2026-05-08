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

  /** Manheim OAuth client id. Wrangler secret. */
  MANHEIM_CLIENT_ID: string;
  /** Manheim OAuth client secret. Wrangler secret. NEVER log this. */
  MANHEIM_CLIENT_SECRET: string;
  /**
   * Vendor profile for the MMR API.
   *   "cox"     — Cox Wholesale-Valuations API (current sandbox account).
   *               URL templates use /mmr and /mmr-lookup; lookup requests carry
   *               Accept and Content-Type = application/vnd.coxauto.v1+json.
   *   "manheim" — Legacy Manheim VIN /valuations/vin and YMM /valuations/search.
   * Absent or unrecognized → "manheim" (legacy default).
   * See docs/COX_API_INTEGRATION.md.
   */
  MANHEIM_API_VENDOR?: string;
  /**
   * OAuth grant type.
   *   "client_credentials" — Cox Bridge 2 flow. Sends HTTP Basic Auth header
   *                          (base64 of client_id:client_secret); body is
   *                          grant_type=client_credentials&scope=...
   *                          MANHEIM_USERNAME / MANHEIM_PASSWORD are not used.
   *   "password" (or absent) — legacy Manheim flow with body credentials.
   */
  MANHEIM_GRANT_TYPE?: string;
  /**
   * OAuth scope appended to the token request body when present.
   * Required for Cox client_credentials. Cox sandbox value:
   *   wholesale-valuations.vehicle.mmr-ext.get
   * Wrong scope → 400 invalid_scope.
   */
  MANHEIM_SCOPE?: string;
  /** Manheim user account name. Required only for password grant. Wrangler secret. */
  MANHEIM_USERNAME: string;
  /** Manheim user account password. Required only for password grant. Wrangler secret. NEVER log this. */
  MANHEIM_PASSWORD: string;
  /**
   * OAuth token endpoint.
   *   Cox sandbox: https://authorize.coxautoinc.com/oauth2/<authServerId>/v1/token
   *                (copy verbatim from the Cox app detail page; do not guess)
   *   Legacy:      https://api.manheim.com/oauth2/token.oauth2
   */
  MANHEIM_TOKEN_URL: string;
  /**
   * MMR API base URL (host + path prefix; no trailing slash). Code appends
   * vendor-specific path segments.
   *   Cox sandbox: https://sandbox.api.coxautoinc.com/wholesale-valuations/vehicle
   *   Legacy:      https://api.manheim.com
   */
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
