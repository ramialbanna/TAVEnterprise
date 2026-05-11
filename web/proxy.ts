import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Auth gate. Every request matched by `config.matcher` (see below) requires an
 * authenticated session, except:
 *   - /signin                 — the sign-in page itself (else: redirect loop)
 *   - /api/auth/*              — Auth.js routes (excluded in the matcher too)
 *   - Next internals & static  — excluded in the matcher
 *
 * Unauthenticated behaviour:
 *   - page request   → 307 redirect to /signin?callbackUrl=<original path + query>
 *   - /api/* request → 401 JSON `{ ok: false, error: "unauthorized" }` (never an HTML redirect —
 *     so client fetch()s fail cleanly instead of receiving the sign-in page)
 */
const PUBLIC_PAGE_PATHS = ["/signin"];

export default auth((req) => {
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

export const config = {
  /*
   * Run on all request paths EXCEPT:
   *   - _next/*            Next.js internals (static chunks, image optimizer)
   *   - api/auth/*         Auth.js routes (handled by their own route handler)
   *   - paths with a dot   static assets in public/ (favicon.ico, *.svg, *.png, ...)
   */
  matcher: ["/((?!_next|api/auth|.*\\..*).*)"],
};
