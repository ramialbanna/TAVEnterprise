import { expect, test } from "@playwright/test";

import { setAuthCookie } from "./helpers/auth";
import { mockAppApi } from "./helpers/app-api-mocks";

/**
 * Ingest Monitor e2e — gates `/ingest` behind the playwright auth cookie and
 * stubs `/api/app/ingest-runs[/:id]` (SSR first paint via `/api/e2e-mocks/app/*`
 * and the client refetch/drill-down via `page.route`). Asserts: the nav entry,
 * the latest-run summary, the run-history table, and the detail drawer
 * diagnostics. A screenshot of the loaded page is saved for the PR.
 */
test.describe("/ingest (authenticated + mocked /api/app/*)", () => {
  test.beforeEach(async ({ context }) => {
    await setAuthCookie(context);
  });

  test("renders the ingest monitor from a healthy fixture", async ({ page }) => {
    await mockAppApi(page);
    await page.goto("/ingest");

    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: /^Ingest Monitor$/i })).toBeVisible();

    // Nav entry present.
    await expect(page.getByRole("link", { name: /Ingest Monitor/i })).toBeVisible();

    // Latest run summary — newest run_id + counts.
    await expect(main.getByText(/latest run/i).first()).toBeVisible();
    await expect(main.getByText("4NyscgfxEA39sJcIY").first()).toBeVisible();
    await expect(main.getByText(/Processed listings:/i)).toBeVisible();

    // Run history table — both fixture runs.
    await expect(main.getByText(/run history/i)).toBeVisible();
    await expect(main.getByText("aEhX3Np1OQcmlOk4D")).toBeVisible();

    await page.screenshot({
      path: "docs/ingest-screenshots/ingest-list.png",
      fullPage: true,
    });

    // Open the detail drawer for the truncated run.
    await main.getByText("aEhX3Np1OQcmlOk4D").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: /filtered-out reasons/i })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /valuation misses/i })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /schema drift/i })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /dead letters/i })).toBeVisible();
    await expect(dialog.getByText(/missing_identifier/i)).toBeVisible();

    await page.screenshot({
      path: "docs/ingest-screenshots/ingest-detail.png",
      fullPage: true,
    });
  });

  // Empty / error / unavailable / unauthorized states are covered by the RTL
  // component test (ingest-client.test.tsx). They can't be surfaced here because
  // the SSR e2e-mocks handler always returns the healthy fixture and /ingest has
  // no client-refresh control to re-trigger the page.route override.
});
