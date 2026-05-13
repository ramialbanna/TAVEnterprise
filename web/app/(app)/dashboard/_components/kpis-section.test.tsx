import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { ApiResult } from "@/lib/app-api";
import type { Kpis } from "@/lib/app-api/schemas";
import { kpisFull, kpisOutcomesUnavailable } from "@/test/msw/fixtures";

import { KpisSection } from "./kpis-section";

function ok(data: Kpis): ApiResult<Kpis> {
  return { ok: true, data, status: 200 };
}

/**
 * Test-only QueryClient: `staleTime: Infinity` so the `initialData` we pass via the
 * section prop is never refetched in the background. `retry: false` so unhandled
 * MSW requests would fail fast — but with infinite staleness they're never made.
 */
function renderSection(initial: ApiResult<Kpis>): { container: HTMLElement } {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnMount: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<KpisSection initial={initial} />, { wrapper: Wrapper });
}

describe("KpisSection", () => {
  it("renders all expected KPI cards from a full KPI fixture", () => {
    const { container } = renderSection(ok(kpisFull));

    // Labels — one card per metric, in the documented order.
    expect(screen.getByText("Total outcomes")).toBeInTheDocument();
    expect(screen.getByText("Avg gross profit")).toBeInTheDocument();
    expect(screen.getByText("Avg hold days")).toBeInTheDocument();
    expect(screen.getByText("Last outcome at")).toBeInTheDocument();
    expect(screen.getByText("Leads")).toBeInTheDocument();
    expect(screen.getByText("Normalized listings")).toBeInTheDocument();

    // Formatted values.
    expect(screen.getByText("3")).toBeInTheDocument(); // totalOutcomes
    expect(screen.getByText("$1,500")).toBeInTheDocument(); // avgGrossProfit
    expect(screen.getByText(/^21\.5$/)).toBeInTheDocument(); // avgHoldDays
    expect(screen.getByText("7")).toBeInTheDocument(); // leads.total
    expect(screen.getByText("42")).toBeInTheDocument(); // listings.normalizedTotal

    // No "Not available" markers anywhere when every block is ok.
    expect(container.textContent ?? "").not.toMatch(/Not available/i);
  });

  it("makes ONLY outcomes-derived cards unavailable when outcomes.value is null", () => {
    renderSection(ok(kpisOutcomesUnavailable));

    // Outcomes-derived cards are unavailable (four UnavailableState markers).
    expect(screen.getAllByText(/Not available/i).length).toBe(4);

    // Leads + Listings still render their real numbers.
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("never renders 0 in place of a null value", () => {
    const partial: Kpis = {
      generatedAt: "2026-05-12T12:00:00.000Z",
      outcomes: {
        value: {
          totalOutcomes: 5,
          avgGrossProfit: null,
          avgHoldDays: null,
          lastOutcomeAt: null,
          byRegion: [],
        },
        missingReason: null,
      },
      leads: { value: null, missingReason: "not_implemented" },
      listings: { value: null, missingReason: "not_implemented" },
    };

    const { container } = renderSection(ok(partial));

    // totalOutcomes is the only real number — no other digit should appear as a metric.
    expect(screen.getByText("5")).toBeInTheDocument();

    // Pull out big-number metric values: every metric value lives in a
    // `text-2xl ... tabular-nums` element. None of them should be a zero in any form.
    const valueNodes = container.querySelectorAll("p.tabular-nums");
    for (const node of valueNodes) {
      const text = node.textContent ?? "";
      expect(text).not.toMatch(/^\$?0(\.0+)?%?$/);
    }
  });

  it("does not render sellThroughRate (removed server-side Round 5)", () => {
    const { container } = renderSection(ok(kpisFull));
    expect(container.textContent ?? "").not.toMatch(/sell[-\s]?through/i);
  });
});
