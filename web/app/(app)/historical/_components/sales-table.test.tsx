import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import type { HistoricalSale } from "@/lib/app-api/schemas";

import { SalesTable } from "./sales-table";

function row(over: Partial<HistoricalSale>): HistoricalSale {
  return {
    id: "hs_x",
    vin: "1FT8W3BT1000001",
    year: 2024,
    make: "Ford",
    model: "F-150",
    trim: "XLT",
    buyer: "Acme Auto",
    buyerUserId: "u_acme",
    acquisitionDate: "2026-04-15",
    saleDate: "2026-05-01",
    acquisitionCost: 14000,
    salePrice: 18000,
    transportCost: 250,
    reconCost: 600,
    auctionFees: 150,
    grossProfit: 3000,
    sourceFileName: "tav-2026-w19.xlsx",
    uploadBatchId: "ib_2026w19",
    createdAt: "2026-05-01T18:00:00.000Z",
    ...over,
  };
}

const EXPECTED_COLUMNS = [
  "Sale date",
  "VIN",
  "Year",
  "Make",
  "Model",
  "Trim",
  "Acquisition cost",
  "Sale price",
  "Transport",
  "Recon",
  "Auction fees",
  "Gross profit",
  "Acquired",
  "Buyer",
  "Source file",
  "Upload batch",
] as const;

/** Columns the schema does not yet expose — assert none of these appear in the header row. */
const FORBIDDEN_COLUMNS = [
  /stock #|stock number/i,
  /mileage/i,
  /front gross/i,
  /back gross/i,
  /total gross/i,
  /days to sell/i,
  /region|store/i,
  /source channel/i,
];

describe("SalesTable", () => {
  it("renders every documented column header", () => {
    render(<SalesTable rows={[row({})]} />);
    const headerRow = screen.getAllByRole("row")[0]!;
    for (const label of EXPECTED_COLUMNS) {
      expect(within(headerRow).getByText(label)).toBeInTheDocument();
    }
  });

  it("does NOT render any of the not-yet-supported columns", () => {
    render(<SalesTable rows={[row({})]} />);
    const headerRow = screen.getAllByRole("row")[0]!;
    for (const re of FORBIDDEN_COLUMNS) {
      expect(within(headerRow).queryByText(re)).toBeNull();
    }
  });

  it("formats currency via formatMoney and dates via formatDate", () => {
    render(<SalesTable rows={[row({})]} />);
    // Money cells
    expect(screen.getByText("$14,000")).toBeInTheDocument(); // acquisitionCost
    expect(screen.getByText("$18,000")).toBeInTheDocument(); // salePrice
    expect(screen.getByText("$250")).toBeInTheDocument(); // transportCost
    expect(screen.getByText("$600")).toBeInTheDocument(); // reconCost
    expect(screen.getByText("$150")).toBeInTheDocument(); // auctionFees
    expect(screen.getByText("$3,000")).toBeInTheDocument(); // grossProfit
    // Date cells (formatDate default → "May 1, 2026" / "April 15, 2026")
    expect(screen.getByText(/May 1, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/April 15, 2026/)).toBeInTheDocument();
  });

  it("renders '—' for null VIN, null trim, null buyer, null source file, null upload batch — never blank, never 0", () => {
    render(
      <SalesTable
        rows={[
          row({
            id: "no-meta",
            vin: null,
            trim: null,
            buyer: null,
            sourceFileName: null,
            uploadBatchId: null,
          }),
        ]}
      />,
    );
    // Five missing fields → at least five em-dash cells (other cells render real data).
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(5);
    // Make absolutely sure no missing cell quietly became $0.
    expect(screen.queryByText("$0")).toBeNull();
  });

  it("renders '—' for null money fields via formatMoney — not $0", () => {
    render(
      <SalesTable
        rows={[
          row({
            acquisitionCost: null,
            transportCost: null,
            reconCost: null,
            auctionFees: null,
            grossProfit: null,
          }),
        ]}
      />,
    );
    // Body row only — header has no $0 either, but scope to body for clarity.
    expect(screen.queryByText("$0")).toBeNull();
    expect(screen.queryByText(/\$0\.00/)).toBeNull();
  });

  it("clicking a row opens the detail sheet with the full record (no extra fetch)", () => {
    render(<SalesTable rows={[row({ id: "click-me" })]} />);
    // The body row is rendered with role=button when onRowClick is wired.
    const clickableRow = screen.getAllByRole("button").find((el) => el.tagName === "TR");
    expect(clickableRow).toBeDefined();
    fireEvent.click(clickableRow!);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/2024 Ford F-150 XLT/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Record click-me/i)).toBeInTheDocument();
    // Sheet body contains formatted fields.
    expect(within(dialog).getByText("$3,000")).toBeInTheDocument(); // grossProfit
    // Sheet has "Buyer" and "Buyer user" rows — both match a loose regex; assert the
    // body actually contains the buyer's display name.
    expect(within(dialog).getByText("Acme Auto")).toBeInTheDocument();
  });

  it("renders the schema-gap note", () => {
    render(<SalesTable rows={[row({})]} />);
    expect(screen.getByText(/more columns pending schema work/i)).toBeInTheDocument();
  });

  it("does not render sellThroughRate anywhere", () => {
    const { container } = render(<SalesTable rows={[row({})]} />);
    expect(container.textContent ?? "").not.toMatch(/sell[-_\s]?through/i);
  });

  it("renders the empty-state copy when rows is []", () => {
    render(<SalesTable rows={[]} emptyTitle="No matching sales" />);
    expect(screen.getByText(/no matching sales/i)).toBeInTheDocument();
  });
});
