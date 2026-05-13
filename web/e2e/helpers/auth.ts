import type { BrowserContext } from "@playwright/test";
import { encode } from "@auth/core/jwt";

/**
 * Auth.js v5 (NextAuth) uses JWE-encrypted JWTs for the JWT session strategy. To get
 * an authenticated dashboard render in Playwright without going through Google OAuth,
 * mint a token with the same `AUTH_SECRET` the dev server runs under (set in
 * `playwright.config.ts → webServer.env`) and write it to the
 * `authjs.session-token` cookie. The proxy's `req.auth` decodes the same cookie.
 *
 * Cookie name notes:
 *   - HTTP (e.g. http://127.0.0.1:3000) → `authjs.session-token`
 *   - HTTPS                              → `__Secure-authjs.session-token`
 * Playwright e2e runs over HTTP, so we always use the non-secure form.
 */
export const SESSION_COOKIE_NAME = "authjs.session-token";

/**
 * Shared dev/CI secret. Exported so `playwright.config.ts` can pass the same value
 * to the spawned dev server via `webServer.env.AUTH_SECRET` — single source of truth.
 * Obviously NOT a production credential.
 */
export const E2E_AUTH_SECRET = "e2e-secret";

export type E2eUser = {
  email: string;
  name?: string;
  picture?: string | null;
};

/** Default user — domain matches `playwright.config.ts → webServer.env.ALLOWED_EMAIL_DOMAIN`. */
export const DEFAULT_E2E_USER: E2eUser = {
  email: "qa@texasautovalue.com",
  name: "QA User",
  picture: null,
};

/**
 * Mint an Auth.js v5 session JWT for `user` and add it to the Playwright context as
 * the `authjs.session-token` cookie. After this, every page in the context is
 * treated by the auth gate as authenticated.
 */
export async function setAuthCookie(
  context: BrowserContext,
  user: E2eUser = DEFAULT_E2E_USER,
  baseUrl = "http://127.0.0.1:3000",
): Promise<void> {
  const token = await encode({
    secret: E2E_AUTH_SECRET,
    salt: SESSION_COOKIE_NAME,
    token: {
      name: user.name ?? null,
      email: user.email,
      picture: user.picture ?? null,
      sub: user.email,
    },
    // 1 hour — plenty for a single playwright run.
    maxAge: 60 * 60,
  });

  const { hostname } = new URL(baseUrl);
  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: token,
      domain: hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
}
