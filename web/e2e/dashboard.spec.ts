import { expect, test } from "@playwright/test";

import { setAuthCookie } from "./helpers/auth";
import { mockAppApi } from "./helpers/app-api-mocks";

/**
 * Dashboard e2e — verifies the authenticated `/dashboard` surface end-to-end against
 * mocked fixtures. Two mock layers cooperate:
 *
 *   1. Server-side first paint (`appApiServer`) is routed to the gated
 *      `/api/e2e-mocks/app/*` handler via `APP_API_BASE_URL` in playwright.config.ts.
 *   2. Browser-side TanStack refreshes go through the same-origin `/api/app/*`
 *      proxy. `mockAppApi(page)` registers `page.route` handlers so a refetch
 *      cannot accidentally escape to the live network.
 *
 * Both layers serve the same fixture content; the spec asserts the public surface
 * only — chart titles, KPI labels/values, the system-health pill, the future-metrics
 * grid, and the no-`sellThroughRate` invariant — never component internals.
 */
test.describe("/dashboard (authenticated + mocked /api/app/*)", () => {
  test.beforeEach(async ({ context, page }) => {
    await setAuthCookie(context);
    await mockAppApi(page);
  });

  test("renders the full dashboard surface from mocked fixtures", async ({ page }) => {
    await page.goto("/dashboard");

    const main = page.getByRole("main");

    // Page identity (scoped to <main> — the topbar also renders a "Dashboard" h1).
    await expect(main.getByRole("heading", { name: /^Dashboard$/i })).toBeVisible();

    // KPI cards (numeric values from the kpis fixture). Scope to the "Top metrics"
    // region — "Avg hold days" also appears as a sr-only column header inside the
    // region charts, so an unscoped match would be ambiguous.
    const topMetrics = main.getByRole("region", { name: /Top metrics/i });
    await expect(topMetrics.getByText("Total outcomes", { exact: true })).toBeVisible();
    await expect(topMetrics.getByText("$1,500")).toBeVisible();
    await expect(topMetrics.getByText("21.5", { exact: true })).toBeVisible();
    await expect(topMetrics.getByText("Avg hold days", { exact: true })).toBeVisible();
    await expect(topMetrics.getByText("Leads", { exact: true })).toBeVisible();
    await expect(topMetrics.getByText("Normalized listings", { exact: true })).toBeVisible();

    // System-health pill — Operational + dialog open.
    const pillTrigger = page.getByRole("button", { name: /system status: operational/i });
    await expect(pillTrigger).toBeVisible();
    await pillTrigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/database/i)).toBeVisible();
    await expect(dialog.getByText(/connected/i)).toBeVisible();
    await expect(dialog.getByText(/intel worker/i)).toBeVisible();
    await expect(dialog.getByText(/stale sweep/i).first()).toBeVisible();
    await page.keyboard.press("Escape");

    // Region charts — title + region labels (sr-only data table carries the labels).
    await expect(main.getByText("Gross by region", { exact: true })).toBeVisible();
    await expect(main.getByText("Hold days by region", { exact: true })).toBeVisible();
    await expect(main.getByText("TX-East").first()).toBeVisible();
    await expect(main.getByText("TX-West").first()).toBeVisible();

    // Gross trend — title + explicit returned-sample caption.
    await expect(
      main.getByText(/Gross trend \(TAV historical sales — returned sample\)/i),
    ).toBeVisible();
    await expect(
      main.getByText(/Based on the most recent 6 historical-sales rows returned by the API/i),
    ).toBeVisible();

    // Future-metrics grid.
    await expect(main.getByText(/coming soon — pending backend/i)).toBeVisible();
    await expect(main.getByText(/^Pending backend$/i).first()).toBeVisible();
    await expect(main.getByText(/Supabase \/ API health/i)).toBeVisible();
    await expect(main.getByText(/Cox \/ Manheim worker/i)).toBeVisible();

    // Recent sales placeholder — row count line from the historical-sales fixture.
    const recent = main.getByRole("region", { name: /Recent sales/i });
    await expect(recent).toBeVisible();
    await expect(recent.getByText(/6 rows loaded\./i)).toBeVisible();

    // sellThroughRate must not appear anywhere on the dashboard.
    expect(await page.locator("body").textContent()).not.toMatch(/sell[-_\s]?through/i);
  });

  test("theme toggle does not break the dashboard surface", async ({ page }) => {
    await page.goto("/dashboard");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: /^Dashboard$/i })).toBeVisible();

    const toggle = page.getByRole("button", { name: /toggle theme|theme/i }).first();
    await toggle.click();

    // After the toggle, the dashboard must still be rendered (no error boundary,
    // no missing chart titles).
    await expect(main.getByRole("heading", { name: /^Dashboard$/i })).toBeVisible();
    await expect(main.getByText("Gross by region", { exact: true })).toBeVisible();
    await expect(main.getByText("Hold days by region", { exact: true })).toBeVisible();
  });
});
