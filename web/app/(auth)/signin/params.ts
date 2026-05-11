/**
 * Pure helper: derive sign-in page state from the route's `searchParams`.
 * Kept separate from page.tsx so it's unit-testable without touching server-only modules.
 */
export interface SignInParams {
  /** Where to send the user after a successful sign-in. Same-origin relative paths only. */
  callbackUrl: string;
  /** True when the sign-in callback rejected the account (wrong email domain). */
  accessDenied: boolean;
}

type RawSearchParams = Record<string, string | string[] | undefined> | undefined;

function firstString(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
  return undefined;
}

/** Accept `callbackUrl` only if it's a same-origin relative path (`/...`, not `//...`). */
function safeCallbackUrl(raw: string | string[] | undefined): string {
  const v = raw; // intentionally NOT firstString — an array-valued callbackUrl is treated as absent
  if (typeof v === "string" && v.startsWith("/") && !v.startsWith("//")) return v;
  return "/";
}

export function resolveSignInParams(sp: RawSearchParams): SignInParams {
  return {
    callbackUrl: safeCallbackUrl(sp?.callbackUrl),
    accessDenied: firstString(sp?.error) === "AccessDenied",
  };
}
