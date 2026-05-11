import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { serverEnv } from "./env";

/**
 * Auth.js (NextAuth v5) configuration for /web.
 *
 * v1 access model: gate the whole dashboard for TAV staff only. Sign-in is restricted to
 * Google Workspace accounts in ALLOWED_EMAIL_DOMAIN (texasautovalue.com). No per-user roles,
 * no lead ownership — the session is purely a dashboard-access token. Auth is unrelated to
 * APP_API_SECRET (which gates the Cloudflare Worker /app/* API server-side); this only gates
 * who may load the dashboard.
 *
 * The config is supplied as a lazy factory so `serverEnv()` (which validates the server env
 * and would otherwise throw at import time when env vars are absent, e.g. under vitest or at
 * `next build`) is only evaluated when an auth handler actually runs.
 */

/**
 * True iff `email`'s domain (everything after the final `@`, case-insensitive) is exactly
 * `allowedDomain`. Subdomains and look-alikes (`x@allowed.com.evil.com`, `x@evil-allowed.com`,
 * `x@sub.allowed.com`) are rejected — v1 uses exact-domain matching only.
 */
export function isAllowedEmail(email: string | null | undefined, allowedDomain: string): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return email.slice(at + 1).trim().toLowerCase() === allowedDomain.trim().toLowerCase();
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const env = serverEnv();
  return {
    secret: env.AUTH_SECRET, // NextAuth v5 also auto-reads AUTH_SECRET; set explicitly for clarity.
    // On Vercel/serverless the request host is trusted (Vercel sets it correctly).
    trustHost: true,
    pages: { signIn: "/signin" },
    providers: [
      Google({
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
        // Hint Google's account chooser toward the workspace domain. UX only — the
        // signIn callback below is the actual gate.
        authorization: { params: { hd: env.ALLOWED_EMAIL_DOMAIN } },
      }),
    ],
    callbacks: {
      signIn({ profile, user }) {
        const email = profile?.email ?? user?.email ?? null;
        // Returning false → NextAuth redirects to /signin?error=AccessDenied.
        return isAllowedEmail(email, env.ALLOWED_EMAIL_DOMAIN);
      },
      session({ session }) {
        // Default JWT-strategy session already exposes only { name, email, image } on
        // session.user. Keep it that way — never enrich the session beyond identity.
        return session;
      },
    },
  };
});
