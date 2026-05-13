import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { HistoricalSale } from "@/lib/app-api/schemas";

import { SalesCharts } from "./sales-charts";

function row(over: Partial<HistoricalSale>): HistoricalSale {
  return {
    id: "hs_x",
    vin: "VIN_X",
    year: 2024,
    make: "Ford",
    model: "F-150",
    trim: null,
    buyer: null,
    buyerUserId: null,
    acquisitionDate: null,
    saleDate: "2026-05-01",
    acquisitionCost: 14000,
    salePrice: 18000,
    transportCost: null,
    reconCost: null,
    auctionFees: null,
    grossProfit: 1500,
    sourceFileName: null,
    uploadBatchId: null,
    createdAt: "2026-05-01T18:00:00.000Z",
    ...over,
  };
}

describe("SalesCharts", () => {
  it("renders all five chart titles and the returned-sample caption with n =", () => {
    const rows = [
      row({ saleDate: "2026-03-15", model: "F-150", grossProfit: 1500, salePrice: 18000 }),
      row({ saleDate: "2026-03-22", model: "F-150", grossProfit: 2500, salePrice: 20000 }),
      row({ saleDate: "2026-04-10", model: "Camry", make: "Toyota", grossProfit: 1800, salePrice: 19000 }),
    ];
    render(<SalesCharts rows={rows} />);

    expect(screen.getByText("Gross by month")).toBeInTheDocument();
    expect(screen.getByText("Volume by month")).toBeInTheDocument();
    expect(screen.getByText(/Top \d+ models by volume — avg gross/i)).toBeInTheDocument();
    expect(screen.getByText("TAV sale price trend — not market retail")).toBeInTheDocument();
    expect(screen.getByText("Gross profit distribution")).toBeInTheDocument();

    // Returned-sample caption appears in the top summary card AND in each chart's
    // caption — assert at least one occurrence with n = 3.
    expect(
      screen.getAllByText(
        /Based on the returned sample \(n = 3\) after active filters — not a full-database aggregate\./i,
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("labels the sale-price chart explicitly as 'not market retail'", () => {
    render(<SalesCharts rows={[row({})]} />);
    expect(screen.getByText("TAV sale price trend — not market retail")).toBeInTheDocument();
    // The chart caption also re-asserts the label so an operator scanning the caption
    // sees it without expanding the title.
    expect(
      screen.getAllByText(/TAV sale price, not market retail\./i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("skips rows with null grossProfit from the gross-by-month chart — no fabricated $0", () => {
    // Need ≥2 months for the line chart (minPoints=2) to render its sr-only data
    // table — otherwise it falls into the insufficient-data state.
    const rows = [
      row({ saleDate: "2026-03-15", grossProfit: 2000 }),
      row({ saleDate: "2026-03-22", grossProfit: null }),
      row({ saleDate: "2026-04-10", grossProfit: 3000 }),
      row({ saleDate: "2026-04-20", grossProfit: null }),
    ];
    render(<SalesCharts rows={rows} />);
    const grossTable = screen.getByRole("table", {
      name: /monthly average gross profit, returned sample/i,
    });
    expect(within(grossTable).getByText("2026-03")).toBeInTheDocument();
    expect(within(grossTable).getByText("2026-04")).toBeInTheDocument();
    expect(within(grossTable).getByText("2000")).toBeInTheDocument();
    expect(within(grossTable).getByText("3000")).toBeInTheDocument();
    // No row should report a value of 0 in this table — null grossProfit must be
    // skipped from the aggregate, never coerced to 0.
    expect(within(grossTable).queryByText(/^0$/)).toBeNull();
  });

  it("renders the three pending-backend placeholders", () => {
    render(<SalesCharts rows={[row({})]} />);
    // PendingBackendState inline → label goes into the `title` attribute.
    expect(screen.getByTitle(/Days to sell by segment/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Aging \/ velocity/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Wholesale-to-retail spread/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^Pending backend$/i).length).toBeGreaterThanOrEqual(3);
  });

  it("renders chart empty states when the filtered set has zero rows (no fake data)", () => {
    render(<SalesCharts rows={[]} />);
    // Every chart's caption uses n = 0 — summary card + each chart caption.
    expect(
      screen.getAllByText(/Based on the returned sample \(n = 0\)/i).length,
    ).toBeGreaterThanOrEqual(1);
    // Charts that require ≥2 points (gross/sale-price line charts) fall to the
    // "Not enough data" state; volume/segment bar + histogram fall to "No data to display".
    expect(screen.getAllByText(/no data to display/i).length).toBeGreaterThanOrEqual(2);
  });

  it("does not render sellThroughRate copy anywhere", () => {
    const { container } = render(
      <SalesCharts
        rows={[
          row({ saleDate: "2026-03-10", grossProfit: 1500 }),
          row({ saleDate: "2026-04-10", grossProfit: 2000 }),
        ]}
      />,
    );
    expect(container.textContent ?? "").not.toMatch(/sell[-_\s]?through/i);
  });
});
