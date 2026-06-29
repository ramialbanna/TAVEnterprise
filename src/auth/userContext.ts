/**
 * Single source of truth for resolving the authenticated user behind an
 * incoming Worker request.
 *
 * Reads identity from:
 *   1. Cloudflare Access headers (`Cf-Access-*`) — direct Worker access.
 *   2. Auth.js proxy headers (`X-TAV-Authenticated-User-*`) — Next.js /api/app/*
 *      proxy after Google sign-in.
 *
 * Handlers MUST NOT parse these headers themselves. Always go through
 * `extractUserContext`.
 *
 * See docs/03-api/intelligence-contracts.md §C and §D for the frozen contract.
 */

/** Injected by the trusted Next.js /api/app/* proxy after Auth.js sign-in. */
export const TAV_USER_EMAIL_HEADER = "X-TAV-Authenticated-User-Email";
export const TAV_USER_NAME_HEADER = "X-TAV-Authenticated-User-Name";

/** Service identity used when the app Worker calls intel via service binding. */
export const TAV_SERVICE_USER_EMAIL = "service@tav-internal";

export interface UserContext {
  userId: string | null;
  email:  string | null;
  name:   string | null;
  roles:  string[];
}

/**
 * Resolve the authenticated user from Cloudflare Access headers.
 *
 * Failure mode (no Access headers): returns a fully-null context with
 * empty roles. The handler decides whether anonymous access is permitted.
 */
export function extractUserContext(request: Request): UserContext {
  const headers = request.headers;

  const email =
    readHeader(headers, "Cf-Access-Authenticated-User-Email")
    ?? readHeader(headers, TAV_USER_EMAIL_HEADER);
  const name =
    readHeader(headers, "Cf-Access-Authenticated-User-Name")
    ?? readHeader(headers, TAV_USER_NAME_HEADER);
  const rolesHeader = readHeader(headers, "Cf-Access-Authenticated-User-Roles");

  // No JWT parsing yet (Phase F.1 deferral). userId mirrors email today;
  // promote to JWT `sub` / tav.users.id once write paths require it.
  const userId = email;

  const roles = rolesHeader
    ? rolesHeader.split(",").map(r => r.trim()).filter(r => r.length > 0)
    : [];

  return { userId, email, name, roles };
}

/**
 * Decide whether the user may bypass the MMR cache and force a fresh
 * Manheim lookup.
 *
 * MVP (temporary) decision logic:
 *   1. roles includes "manager"  → allow
 *   2. email is in MANAGER_EMAIL_ALLOWLIST env var (comma-separated) → allow
 *   3. otherwise → deny
 *
 * This is a stop-gap until `tav.user_roles` exists. The env-var path will
 * be removed once role data lives in Postgres.
 *
 * @param ctx              The user context from `extractUserContext`.
 * @param managerAllowlist The raw value of MANAGER_EMAIL_ALLOWLIST env var,
 *                         or undefined if unset.
 */
export function canForceRefresh(
  ctx: UserContext,
  managerAllowlist: string | undefined,
): boolean {
  if (ctx.roles.includes("manager")) return true;

  if (!ctx.email || !managerAllowlist) return false;

  const allowlist = managerAllowlist
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0);

  return allowlist.includes(ctx.email.toLowerCase());
}

/**
 * Whether this caller may request `force_refresh` on an MMR lookup.
 * Includes the trusted app Worker service identity (Refresh valuation on detail).
 */
export function canForceRefreshMmrLookup(
  ctx: UserContext,
  managerAllowlist: string | undefined,
): boolean {
  if (ctx.email === TAV_SERVICE_USER_EMAIL) return true;
  return canForceRefresh(ctx, managerAllowlist);
}

function readHeader(headers: Headers, name: string): string | null {
  const v = headers.get(name);
  if (v === null) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}
