import type { Session } from "next-auth";

/**
 * Trusted identity headers injected by the /api/app/* proxy.
 * Must stay in sync with src/auth/userContext.ts.
 */
export const TAV_USER_EMAIL_HEADER = "X-TAV-Authenticated-User-Email";
export const TAV_USER_NAME_HEADER = "X-TAV-Authenticated-User-Name";

/**
 * Build trusted identity headers for the Cloudflare Worker /app/* API.
 * Only call from the authenticated /api/app/* proxy — never from the browser.
 */
export function buildAppUserHeaders(session: Session | null): Record<string, string> {
  const email = session?.user?.email?.trim();
  if (!email) return {};

  const headers: Record<string, string> = {
    [TAV_USER_EMAIL_HEADER]: email,
  };

  const name = session?.user?.name?.trim();
  if (name) headers[TAV_USER_NAME_HEADER] = name;

  return headers;
}
