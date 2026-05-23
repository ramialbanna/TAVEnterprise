import type { Env } from "../types/env";
import { extractUserContext } from "./userContext";
import { getSupabaseClient } from "../persistence/supabase";
import { getOrCreateUserByEmail, UserInactiveError, type AppUser } from "../persistence/users";

/**
 * Resolve the authenticated TAV staff user for an /app/* request.
 *
 * Identity arrives via headers injected by the trusted Next.js proxy after
 * Auth.js sign-in (X-TAV-Authenticated-User-*). Cloudflare Access headers
 * remain supported for direct Worker access during staging.
 *
 * Returns null when no identity headers are present (anonymous service call).
 */
export async function resolveAppUser(request: Request, env: Env): Promise<AppUser | null> {
  const ctx = extractUserContext(request);
  if (!ctx.email) return null;

  const db = getSupabaseClient(env);
  try {
    return await getOrCreateUserByEmail(db, {
      email: ctx.email,
      displayName: ctx.name,
    });
  } catch (err) {
    if (err instanceof UserInactiveError) return null;
    throw err;
  }
}

export { UserInactiveError };
