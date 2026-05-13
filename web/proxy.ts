import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Auth gate (Next 16 "proxy" — the renamed middleware entry point). Every request matched
 * by `config.matcher` (see below) requires an authenticated session, except:
 *   - /signin                 — the sign-in page itself (else: redirect loop)
 *   - /api/auth/*              — Auth.js routes (excluded in the matcher too)
 *   - Next internals & static  — excluded in the matcher
 *
 * Unauthenticated behaviour:
 *   - page request   → 307 redirect to /signin?callbackUrl=<original path + query>
 *   - /api/* request → 401 JSON `{ ok: false, error: "unauthorized" }` (never an HTML redirect —
 *     so client fetch()s fail cleanly instead of receiving the sign-in page)
 *
 * Next 16 requires this file to export a function named `proxy` (or a default function).
 * `lib/auth.ts` uses the lazy `NextAuth(() => config)` form, so its `auth()` helper is async:
 * `auth(handler)` returns a Promise that resolves to the wrapped middleware. `proxy` therefore
 * awaits it per request, then delegates. (`await` on the non-lazy form is a harmless no-op.)
 */
const PUBLIC_PAGE_PATHS = ["/signin"];

const authGate = auth((req) => {
  const { pathname, search } = req.nextUrl;

  // Public pages (and anything nested under them) — let through regardless of session.
  if (PUBLIC_PAGE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return;
  }

  // Authenticated → proceed.
  if (req.auth) return;

  // Unauthenticated:
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const signInUrl = new URL("/signin", req.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(signInUrl);
});

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const handler = (await authGate) as unknown as (
    request: NextRequest,
    event: NextFetchEvent,
  ) => Promise<Response>;
  return handler(request, event);
}

export const config = {
  /*
   * Run on all request paths EXCEPT:
   *   - _next/*            Next.js internals (static chunks, image optimizer)
   *   - api/auth/*         Auth.js routes (handled by their own route handler)
   *   - api/e2e-mocks/*    E2E fixture handler — its `route.ts` is itself gated by
   *                        `E2E_MOCKS === "1"` and returns 404 in any non-test
   *                        environment, so it is safe (and necessary) to skip the
   *                        auth gate here. Server-side first-paint fetches in
   *                        Playwright go through this path with no cookies.
   *   - paths with a dot   static assets in public/ (favicon.ico, *.svg, *.png, ...)
   */
  matcher: ["/((?!_next|api/auth|api/e2e-mocks|.*\\..*).*)"],
};
