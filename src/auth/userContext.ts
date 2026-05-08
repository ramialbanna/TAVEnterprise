/**
 * Single source of truth for resolving the authenticated user behind an
 * incoming Worker request.
 *
 * Reads Cloudflare Access headers (`Cf-Access-*`). No JWT parsing yet — that
 * is a deliberate Phase F.1 deferral; promote `userId` to the JWT `sub`
 * claim once the parser lands.
 *
 * Handlers MUST NOT parse `Cf-Access-*` headers themselves. Always go
 * through `extractUserContext`.
 *
 * See docs/INTELLIGENCE_CONTRACTS.md §C and §D for the frozen contract.
 */

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

  const email = readHeader(headers, "Cf-Access-Authenticated-User-Email");
  const name  = readHeader(headers, "Cf-Access-Authenticated-User-Name");
  const rolesHeader = readHeader(headers, "Cf-Access-Authenticated-User-Roles");

  // No JWT parsing yet (Phase F.1 deferral). userId mirrors email today;
  // promote to JWT `sub` claim once the parser lands.
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

function readHeader(headers: Headers, name: string): string | null {
  const v = headers.get(name);
  if (v === null) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}
