/**
 * Re-export of the root project's authoritative user-context helpers.
 *
 * Do NOT duplicate the implementation — see /src/auth/userContext.ts. Any
 * behavioral change must happen at the root and propagates here automatically.
 */
export { extractUserContext, canForceRefresh } from "../../../../src/auth/userContext";
export type { UserContext } from "../../../../src/auth/userContext";
