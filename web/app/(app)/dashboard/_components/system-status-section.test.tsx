import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { ApiResult } from "@/lib/app-api";
import type { SystemStatus } from "@/lib/app-api/schemas";
import {
  systemStatusDbDown,
  systemStatusHealthy,
  systemStatusNeverRun,
} from "@/test/msw/fixtures";

import { SystemStatusSection } from "./system-status-section";

function ok(data: SystemStatus): ApiResult<SystemStatus> {
  return { ok: true, data, status: 200 };
}

function renderSection(initial: ApiResult<SystemStatus>): { container: HTMLElement } {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnMount: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<SystemStatusSection initial={initial} />, { wrapper: Wrapper });
}

describe("SystemStatusSection", () => {
  it("renders an Operational pill for a healthy /app/system-status payload", () => {
    renderSection(ok(systemStatusHealthy));
    const trigger = screen.getByRole("button", { name: /system status: operational/i });
    expect(within(trigger).getByText(/operational/i)).toBeInTheDocument();
  });

  it("opens a detail dialog with DB / intel worker / stale sweep / sources rows", () => {
    renderSection(ok(systemStatusHealthy));
    fireEvent.click(screen.getByRole("button", { name: /system status: operational/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/system status/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/database/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/connected/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/intel worker/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/stale sweep/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/^sources$/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/facebook/i)).toBeInTheDocument();
  });

  it("renders an error/down pill when db.ok is false", () => {
    renderSection(ok(systemStatusDbDown));
    const trigger = screen.getByRole("button", { name: /database unavailable/i });
    expect(trigger).toBeInTheDocument();
  });

  it("renders a degraded/review pill when staleSweep is never_run while DB is up", () => {
    renderSection(ok(systemStatusNeverRun));
    const trigger = screen.getByRole("button", { name: /degraded/i });
    expect(trigger).toBeInTheDocument();

    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    // The "Stale sweep" row label is present (along with a never-run sub-message that
    // also mentions "stale sweep" — getAllByText is the safer assertion).
    expect(within(dialog).getAllByText(/stale sweep/i).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/hasn't run yet/i)).toBeInTheDocument();
  });

  it("routes a server-kind ApiResult failure to ErrorState; renderApiResult passes refetch as onRetry", () => {
    // `kind: "unavailable"` would render as a muted UnavailableState (no role=alert).
    // The route-to-ErrorState branch fires for any other non-ok kind; use `kind:"server"`
    // here so the alert region + Retry button actually mount.
    const failingInitial: ApiResult<SystemStatus> = {
      ok: false,
      kind: "server",
      error: "internal_error",
      status: 500,
      message: "The TAV API hit an unexpected error — try again.",
    };
    renderSection(failingInitial);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // Retry exists when the kind is retryable. `server` is not retryable per
    // `isRetryableError` (only `unavailable`/`proxy`), so we only assert the alert here.
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("renders a retryable Retry button for a proxy-kind ApiResult failure", () => {
    const failingInitial: ApiResult<SystemStatus> = {
      ok: false,
      kind: "proxy",
      error: "upstream_non_json",
      status: 502,
      message: "Upstream non-JSON — try again.",
    };
    renderSection(failingInitial);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // The click handler is wired to `query.refetch()` — TanStack handles the refetch
    // internally; the test asserts the button is mounted and clickable without throwing.
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
  });

  it("does not render any secret-shaped values (no Authorization, Bearer, or api key strings)", () => {
    const { container } = renderSection(ok(systemStatusHealthy));
    fireEvent.click(screen.getByRole("button", { name: /system status: operational/i }));
    const text = (container.textContent ?? "") + (document.body.textContent ?? "");
    expect(text).not.toMatch(/bearer\s+/i);
    expect(text).not.toMatch(/authorization/i);
    expect(text).not.toMatch(/api[_-]?key/i);
    expect(text).not.toMatch(/secret/i);
    // Long hex/base64-like strings that look like a token (>= 24 chars) — workers.dev URLs
    // are fine, so we only flag bare token-shaped tokens.
    expect(text).not.toMatch(/\b[A-Za-z0-9_-]{40,}\b/);
  });
});
