"use client";

import Link from "next/link";
import { RefreshCw, ShieldAlert, TriangleAlert } from "lucide-react";

import type { ApiResult, ErrorKind } from "@/lib/app-api";
import { isRetryableError } from "@/lib/query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type ApiErrorResult = Extract<ApiResult<unknown>, { ok: false }>;

/** Short headline for an error region, by kind. Pure — unit-tested. */
export function errorStateTitle(kind: ErrorKind): string {
  switch (kind) {
    case "unauthorized":
      return "Session expired";
    case "unavailable":
      return "Temporarily unavailable";
    case "invalid":
      return "Request rejected";
    case "server":
      return "Server error";
    case "proxy":
      return "Dashboard misconfigured";
    case "unknown":
    default:
      return "Something went wrong";
  }
}

/**
 * Error region for a failed `ApiResult`. Renders the kind-derived headline, the
 * human message (`error.message`, already mapped via `codeMessage`), and — when the
 * error is retryable and an `onRetry` is supplied — a Retry button. For an expired
 * session it shows a sign-in link instead of Retry.
 */
export function ErrorState({
  error,
  onRetry,
  title,
  message,
  className,
}: {
  error: ApiErrorResult;
  onRetry?: () => void;
  title?: string;
  message?: string;
  className?: string;
}) {
  const isAuth = error.kind === "unauthorized";
  const Icon = isAuth ? ShieldAlert : TriangleAlert;
  const heading = title ?? errorStateTitle(error.kind);
  const body = message ?? error.message;
  const showRetry = !isAuth && !!onRetry && isRetryableError(error);

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-status-error/30 bg-status-error-bg px-6 py-8 text-center",
        className,
      )}
    >
      <Icon className="size-5 text-status-error" aria-hidden />
      <p className="text-sm font-medium text-status-error">{heading}</p>
      <p className="max-w-md text-xs text-status-error/90">{body}</p>
      <div className="mt-2 flex items-center gap-2">
        {showRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw />
            Retry
          </Button>
        ) : null}
        {isAuth ? (
          <Button size="sm" variant="outline" asChild>
            <Link href="/signin">Sign in again</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Convenience wrapper for a known-expired session (no `ApiResult` in hand). */
export function SessionExpiredState({ className }: { className?: string }) {
  return (
    <ErrorState
      className={className}
      error={{
        ok: false,
        kind: "unauthorized",
        error: "unauthorized",
        status: 401,
        message: "Your session has expired — sign in again.",
      }}
    />
  );
}
