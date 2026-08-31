"use client";

import type { ReactNode } from "react";

import type { ApiResult } from "@/lib/app-api";
import { ErrorState, UnavailableState } from "@/components/data-state";

import { QueryPending } from "./query-pending";

/**
 * Dashboard-local helper for rendering one `ApiResult<T>`:
 *   - `undefined`                     → pending skeleton (client-first nav).
 *   - `ok: true`                      → `renderOk(data)`.
 *   - `kind === "unavailable"`        → `<UnavailableState code={error}>` (block by default).
 *   - any other failure kind          → `<ErrorState error onRetry>`.
 *
 * `CaveatBanner` is deliberately NOT used here — that primitive is reserved for persistent
 * product caveats, not transient transport/API errors.
 */
export function renderApiResult<T>(
  result: ApiResult<T> | undefined,
  renderOk: (data: T) => ReactNode,
  options: { onRetry?: () => void; unavailableTitle?: string; pendingLabel?: string } = {},
): ReactNode {
  if (result === undefined) {
    return <QueryPending label={options.pendingLabel ?? "Loading…"} />;
  }
  if (result.ok) return renderOk(result.data);
  if (result.kind === "unavailable") {
    return <UnavailableState code={result.error} title={options.unavailableTitle} />;
  }
  return <ErrorState error={result} onRetry={options.onRetry} />;
}
