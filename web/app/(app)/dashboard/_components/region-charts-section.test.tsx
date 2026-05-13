import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { ApiResult } from "@/lib/app-api";
import type { Kpis } from "@/lib/app-api/schemas";
import { kpisFull, kpisOutcomesUnavailable } from "@/test/msw/fixtures";

import { RegionChartsSection } from "./region-charts-section";

function ok(data: Kpis): ApiResult<Kpis> {
  return { ok: true, data, status: 200 };
}

function renderSection(initial: ApiResult<Kpis>): { container: HTMLElement } {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnMount: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<RegionChartsSection initial={initial} />, { wrapper: Wrapper });
}

describe("RegionChartsSection", () => {
  it("renders both chart titles and the byRegion labels for a full fixture", () => {
    renderSection(ok(kpisFull));

    expect(screen.getByText("Gross by region")).toBeInTheDocument();
    expect(screen.getByText("Hold days by region")).toBeInTheDocument();

    // Region labels appear inside both charts' sr-only data tables.
    const grossTable = screen.getByRole("table", { name: /average gross profit/i });
    expect(within(grossTable).getAllByText("TX-East").length).toBeGreaterThan(0);
    expect(within(grossTable).getAllByText("TX-West").length).toBeGreaterThan(0);

    const holdTable = screen.getByRole("table", { name: /average hold days/i });
    expect(within(holdTable).getByText("19")).toBeInTheDocument();
    expect(within(holdTable).getByText("24")).toBeInTheDocument();
  });

  it("renders both empty-states when byRegion is []", () => {
    const empty: Kpis = {
      ...kpisFull,
      outcomes: {
        value: { ...kpisFull.outcomes.value!, byRegion: [] },
        missingReason: null,
      },
    };
    renderSection(ok(empty));
    // ChartFrame's empty copy is rendered twice (one per chart).
    expect(screen.getAllByText(/no data to display/i).length).toBe(2);
  });

  it("renders a single UnavailableState when outcomes.value is null (missingReason set)", () => {
    renderSection(ok(kpisOutcomesUnavailable));

    expect(screen.getByText(/region charts unavailable/i)).toBeInTheDocument();
    // The KPI cards' Leads/Listings tiles live in a sibling section, so neither chart title
    // should be present here — confirming the unavailable branch isolated outcomes.
    expect(screen.queryByText("Gross by region")).toBeNull();
    expect(screen.queryByText("Hold days by region")).toBeNull();
  });

  it("skips rows missing the metric field instead of coercing them to 0", () => {
    const partial: Kpis = {
      ...kpisFull,
      outcomes: {
        value: {
          ...kpisFull.outcomes.value!,
          byRegion: [
            { region: "TX-East", avg_gross_profit: 1700, avg_hold_days: 19 },
            { region: "TX-West", avg_hold_days: 24 }, // missing gross
            { region: "TX-South", avg_gross_profit: null, avg_hold_days: null }, // both null
          ],
        },
        missingReason: null,
      },
    };
    renderSection(ok(partial));

    const grossTable = screen.getByRole("table", { name: /average gross profit/i });
    const grossRows = within(grossTable).getAllByRole("row");
    // 1 header + 1 valid datum = 2 rows. TX-West and TX-South skipped (not 0-filled).
    expect(grossRows.length).toBe(2);
    expect(within(grossTable).getByText("TX-East")).toBeInTheDocument();
    expect(within(grossTable).queryByText("TX-West")).toBeNull();
    expect(within(grossTable).queryByText("TX-South")).toBeNull();
    expect(within(grossTable).queryByText("0")).toBeNull();
  });

  it("does not render sellThroughRate copy anywhere", () => {
    const withSellThrough: Kpis = {
      ...kpisFull,
      outcomes: {
        value: {
          ...kpisFull.outcomes.value!,
          byRegion: [
            { region: "TX-East", avg_gross_profit: 1700, avg_hold_days: 19, sell_through_rate: 0.9 },
          ],
        },
        missingReason: null,
      },
    };
    const { container } = renderSection(ok(withSellThrough));
    expect(container.textContent ?? "").not.toMatch(/sell[-_\s]?through/i);
  });
});
