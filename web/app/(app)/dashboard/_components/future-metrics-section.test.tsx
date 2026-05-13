import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { ApiResult } from "@/lib/app-api";
import type { SystemStatus } from "@/lib/app-api/schemas";
import {
  systemStatusDbDown,
  systemStatusHealthy,
  systemStatusNeverRun,
} from "@/test/msw/fixtures";

import { FutureMetricsSection } from "./future-metrics-section";

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
  return render(<FutureMetricsSection initial={initial} />, { wrapper: Wrapper });
}

describe("FutureMetricsSection", () => {
  it("renders the 'Coming soon — pending backend' header + pending tiles", () => {
    renderSection(ok(systemStatusHealthy));
    expect(screen.getByText(/coming soon — pending backend/i)).toBeInTheDocument();

    // Each pending tile renders the inline 'Pending backend' marker.
    const pending = screen.getAllByText(/^Pending backend$/i);
    expect(pending.length).toBeGreaterThanOrEqual(6);

    expect(screen.getByText(/lead conversion rate/i)).toBeInTheDocument();
    expect(screen.getByText(/mmr cache hit rate/i)).toBeInTheDocument();
    expect(screen.getByText(/buyer pipeline/i)).toBeInTheDocument();
  });

  it("promotes Supabase/API health, Cox/Manheim worker, MMR routing, and source ingest from a healthy system-status fixture", () => {
    renderSection(ok(systemStatusHealthy));

    expect(screen.getByText(/supabase \/ api health/i)).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();

    expect(screen.getByText(/cox \/ manheim worker/i)).toBeInTheDocument();
    expect(screen.getByText(/Worker · binding/i)).toBeInTheDocument();

    expect(screen.getByText(/mmr routing mode/i)).toBeInTheDocument();
    expect(screen.getByText(/^Worker$/i)).toBeInTheDocument();

    expect(screen.getByText(/source ingest/i)).toBeInTheDocument();
    expect(screen.getByText(/1 configured/i)).toBeInTheDocument();
    expect(screen.getByText(/most recent: facebook/i)).toBeInTheDocument();
  });

  it("renders 'Unavailable' for Supabase tile when db.ok is false (no fabricated value)", () => {
    const { container } = renderSection(ok(systemStatusDbDown));

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    // Source-ingest must NOT present a real-looking '0 configured' when the upstream
    // DB is itself down — fall through to the dashboard-wide UnavailableState instead.
    expect(screen.queryByText(/0 configured/i)).toBeNull();
    expect(screen.queryByText(/no sources reporting/i)).toBeNull();
    // No '$0' / number coercion anywhere.
    expect(container.textContent ?? "").not.toMatch(/\$0\b/);
  });

  it("stays honest when staleSweep is never_run (no fabricated sweep tile)", () => {
    const { container } = renderSection(ok(systemStatusNeverRun));
    // Sweep state is only surfaced in SystemStatusSection's pill/dialog, not here. The
    // 'Pending backend' grid still renders, and nothing pretends sweep ran.
    expect(screen.getByText(/coming soon — pending backend/i)).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/sweep ran|sweep ok|stale-listing reclaim:\s*[0-9]/i);
  });

  it("renders a 'review' status (no fabricated healthy) when intel worker is unrouted", () => {
    const data: SystemStatus = {
      ...systemStatusHealthy,
      intelWorker: { mode: "worker", binding: false, url: null },
    };
    renderSection(ok(data));
    expect(screen.getByText(/Worker · unrouted/i)).toBeInTheDocument();
    expect(screen.getByText(/no route configured/i)).toBeInTheDocument();
  });

  it("does not render sellThroughRate copy anywhere", () => {
    const { container } = renderSection(ok(systemStatusHealthy));
    expect(container.textContent ?? "").not.toMatch(/sell[-_\s]?through/i);
  });

  it("does not render secret-shaped values (bearer / authorization / api key / long opaque tokens)", () => {
    const { container } = renderSection(ok(systemStatusHealthy));
    const text = container.textContent ?? "";
    // Match concrete credential leaks rather than the bare word "secret", so any
    // future copy that mentions "secrets management" can't false-positive this test.
    expect(text).not.toMatch(/bearer\s+\S/i);
    expect(text).not.toMatch(/authorization:/i);
    expect(text).not.toMatch(/api[_-]?key/i);
    expect(text).not.toMatch(/password/i);
    expect(text).not.toMatch(/service[_-]?role/i);
    expect(text).not.toMatch(/\b[A-Za-z0-9_-]{40,}\b/);
  });
});
