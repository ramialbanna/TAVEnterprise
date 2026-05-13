import { expect, test } from "@playwright/test";

import { setAuthCookie } from "./helpers/auth";

/**
 * Historical sales e2e — verifies the authenticated `/historical` surface end-to-end.
 *
 * Two mock layers cooperate:
 *   1. SSR first paint (`appApiServer.listHistoricalSales({ limit: 100 })`) is served by
 *      the gated `/api/e2e-mocks/app/historical-sales` handler — the same 6-row
 *      fixture every browser-side mock starts from (`E2E_HISTORICAL_SALES`).
 *   2. Browser-side TanStack refreshes (filter changes) go through `/api/app/historical-sales*`.
 *      Per-test `page.route` handlers intercept those so a filter scenario can shape the
 *      response without touching SSR.
 *
 * Assertions target user-visible copy and counts; internal selectors are avoided.
 */

/** Mirror of `E2E_HISTORICAL_SALES` from `helpers/app-api-mocks.ts`. Six rows. */
const SEED_ROWS = [
  saleRow(1, "2026-03-10", 1200),
  saleRow(2, "2026-03-20", 1800),
  saleRow(3, "2026-04-05", 1400),
  saleRow(4, "2026-04-22", 1600),
  saleRow(5, "2026-05-01", 1500),
  saleRow(6, "2026-05-10", 1700),
];

function saleRow(i: number, saleDate: string, gross: number) {
  return {
    id: `hs_${i}`,
    vin: i % 3 === 0 ? null : `1FT8W3BT${String(1000000 + i)}`,
    year: 2024,
    make: "Ford",
    model: "F-150",
    trim: "XLT",
    buyer: "Acme Auto",
    buyerUserId: "u_acme",
    acquisitionDate: saleDate,
    saleDate,
    acquisitionCost: 14000 + i * 100,
    salePrice: 14000 + i * 100 + gross + 400,
    transportCost: 250,
    reconCost: null,
    auctionFees: 150,
    grossProfit: gross,
    sourceFileName: "e2e-fixture.xlsx",
    uploadBatchId: "ib_e2e",
    createdAt: `${saleDate}T18:00:00.000Z`,
  };
}

function envelope(rows: unknown[]) {
  return { ok: true, data: rows };
}

const FORBIDDEN_HEADER_REGEXES = [
  /stock #|stock number/i,
  /mileage/i,
  /front gross/i,
  /back gross/i,
  /total gross/i,
  /days to sell/i,
  /region|store/i,
  /source channel/i,
  /sell[-_\s]?through/i,
];

test.describe("/historical (authenticated)", () => {
  test.beforeEach(async ({ context }) => {
    await setAuthCookie(context);
  });

  test("loads with heading + current-data caveat", async ({ page }) => {
    await page.goto("/historical");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: /TAV Historical Data/i })).toBeVisible();
    await expect(
      main.getByText(/Showing what TAV's data currently includes — more columns\/filters after schema work\./i),
    ).toBeVisible();
  });

  test("renders documented columns in the table — and NO forbidden/future columns", async ({ page }) => {
    await page.goto("/historical");

    // Scope to the SalesTable specifically — chart sr-only data tables also contain
    // `<table>` elements, so a generic `getByRole('table')` would be ambiguous.
    const salesTable = page
      .locator("table")
      .filter({ has: page.getByText("Upload batch") })
      .first();
    await expect(salesTable).toBeVisible();

    // Every documented column header.
    for (const label of [
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
    ]) {
      await expect(salesTable.getByRole("button", { name: `Sort by ${label}` })).toBeVisible();
    }

    // No forbidden column header in the table header row specifically. Asserting on
    // the full page would false-positive against histogram axis labels / page copy
    // ("more columns after schema work", etc.).
    const headerText = (await salesTable.locator("thead").textContent()) ?? "";
    for (const re of FORBIDDEN_HEADER_REGEXES) {
      expect(headerText).not.toMatch(re);
    }
  });

  test("charts render with the returned-sample n caption and the 'not market retail' label", async ({
    page,
  }) => {
    await page.goto("/historical");

    const main = page.getByRole("main");
    await expect(main.getByText("Gross by month")).toBeVisible();
    await expect(main.getByText("Volume by month")).toBeVisible();
    await expect(main.getByText(/Top \d+ models by volume — avg gross/i)).toBeVisible();
    await expect(main.getByText("TAV sale price trend — not market retail")).toBeVisible();
    await expect(main.getByText("Gross profit distribution")).toBeVisible();

    // Returned-sample n caption with the SSR fixture's row count.
    await expect(
      main.getByText(new RegExp(`Based on the returned sample \\(n = ${SEED_ROWS.length}\\)`, "i")).first(),
    ).toBeVisible();
  });

  test("applying a server-backed filter (year) refetches with the filter and shows an active chip", async ({
    page,
  }) => {
    let lastQuery: string | null = null;
    let calls = 0;
    await page.route("**/api/app/historical-sales*", (route) => {
      calls += 1;
      lastQuery = new URL(route.request().url()).search;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(envelope([])),
      });
    });

    await page.goto("/historical");
    await page.getByLabel(/^Year$/i).fill("2025");

    // Wait for the chip + EmptyState to render after the refetch.
    await expect(page.getByText(/year: 2025/i)).toBeVisible();
    await expect(page.getByText(/0 of 0 rows? after filters/i)).toBeVisible();

    // Server payload carried the filter; client-only fields stayed local.
    expect(calls).toBeGreaterThan(0);
    expect(lastQuery ?? "").toContain("year=2025");
    expect(lastQuery ?? "").toContain("limit=100");
    expect(lastQuery ?? "").not.toMatch(/trim=/);
    expect(lastQuery ?? "").not.toMatch(/vinPresent=/);
    expect(lastQuery ?? "").not.toMatch(/grossMin=/);
    expect(lastQuery ?? "").not.toMatch(/grossMax=/);
  });

  test("client-only filters (VIN presence, gross min) narrow the count WITHOUT an API call", async ({
    page,
  }) => {
    let calls = 0;
    await page.route("**/api/app/historical-sales*", (route) => {
      calls += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(envelope(SEED_ROWS)),
      });
    });

    await page.goto("/historical");

    // SSR first paint: 6 rows.
    await expect(page.getByText(/6 of 6 rows? after filters/i)).toBeVisible();

    // VIN missing → 2 rows (ids 3, 6 have null vin per the fixture).
    await page.getByLabel(/^VIN/i).selectOption("missing");
    await expect(page.getByText(/2 of 6 rows? after filters/i)).toBeVisible();
    await expect(page.getByText(/VIN: missing/i)).toBeVisible();

    // Reset VIN filter, then apply gross min 1500 → 4 rows (gross ≥ 1500: 1800/1600/1500/1700).
    await page.getByLabel(/^VIN/i).selectOption("any");
    await page.getByLabel(/Gross min/i).fill("1500");
    await expect(page.getByText(/4 of 6 rows? after filters/i)).toBeVisible();
    await expect(page.getByText(/gross ≥ \$1500/i)).toBeVisible();

    // No browser-side API call fired — only SSR's call which page.route does NOT see.
    expect(calls).toBe(0);
  });

  test("clicking a row opens the detail sheet with the selected row's data", async ({ page }) => {
    await page.goto("/historical");

    // First body row (after the header). Body rows are role=button when onRowClick is wired.
    const rows = page.getByRole("button").filter({ has: page.locator("td") });
    await expect(rows.first()).toBeVisible();
    await rows.first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/2024 Ford F-150 XLT/i)).toBeVisible();
    await expect(dialog.getByText(/Acme Auto/i)).toBeVisible();
    // Schema-gap reminder lives inside the sheet body.
    await expect(dialog.getByText(/More columns pending schema work\./i)).toBeVisible();
  });

  test("empty state is honest (no fabricated $0) when the API returns zero rows", async ({ page }) => {
    await page.route("**/api/app/historical-sales*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(envelope([])),
      }),
    );

    await page.goto("/historical");
    // Triggers a client refetch that returns [].
    await page.getByLabel(/^Year$/i).fill("2025");

    // Empty state copy (from the SalesTable's emptyTitle).
    await expect(page.getByText(/No matching sales/i).first()).toBeVisible();

    // No fixture-derived money value rendered — when the table is empty the seed row's
    // acquisition cost ($14,100 for row 1) must not appear anywhere. The histogram axis
    // labels legitimately contain "$0" as a bucket edge, so this anti-marker is the
    // honest test of "no fabricated row".
    const body = (await page.locator("body").textContent()) ?? "";
    expect(body).not.toContain("$14,100");
  });
});
