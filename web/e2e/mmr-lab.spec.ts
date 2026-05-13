import { expect, test } from "@playwright/test";

import { setAuthCookie } from "./helpers/auth";

/**
 * MMR Lab e2e — verifies the authenticated `/mmr-lab` surface against scoped
 * `page.route` mocks for `/api/app/mmr/vin`. The auth helper is reused from the
 * dashboard spec; no global mocks (each scenario installs only the routes it needs).
 *
 * Assertions intentionally target user-facing copy (`$68,600`, `Strong Buy`,
 * `Headroom $6,600`) rather than internal class names or component selectors — the
 * spec is testing what the operator sees, not how it's wired underneath.
 *
 * The Cox-sandbox caveat banner was removed 2026-05-13 once Cox production MMR
 * credentials went live; assertions for that copy are intentionally gone.
 */

const EXAMPLE_VIN = "1FT8W3BT1SEC27066";

test.describe("/mmr-lab (authenticated)", () => {
  test.beforeEach(async ({ context }) => {
    await setAuthCookie(context);
  });

  test("loads while authenticated and renders the lab heading", async ({ page }) => {
    await page.goto("/mmr-lab");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: /VIN \/ MMR Lab/i })).toBeVisible();
    // No sandbox caveat banner should remain on the page.
    await expect(
      main.getByText(/sandbox-backed/i),
    ).toHaveCount(0);
  });

  test("Fill example populates VIN, mileage, year, make, and model", async ({ page }) => {
    await page.goto("/mmr-lab");
    await page.getByRole("button", { name: /fill example/i }).click();

    await expect(page.getByLabel(/^VIN/i)).toHaveValue(EXAMPLE_VIN);
    await expect(page.getByLabel(/^Mileage$/i)).toHaveValue("50000");
    await expect(page.getByLabel(/^Year/i)).toHaveValue("2025");
    await expect(page.getByLabel(/^Make/i)).toHaveValue("Ford");
    await expect(page.getByLabel(/^Model/i)).toHaveValue("F-350SD");
  });

  test("lookup with asking price 62000 shows MMR $68,600, Strong Buy, and Headroom $6,600", async ({
    page,
  }) => {
    await page.route("**/api/app/mmr/vin", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: { mmrValue: 68600, confidence: "high", method: "vin" },
        }),
      }),
    );

    await page.goto("/mmr-lab");
    await page.getByRole("button", { name: /fill example/i }).click();
    await page.getByLabel(/Asking price/i).fill("62000");
    await page.getByRole("button", { name: /look up mmr/i }).click();

    // MMR value, confidence pill, method.
    await expect(page.getByText("$68,600")).toBeVisible();
    await expect(page.getByText(/^high$/i)).toBeVisible();
    await expect(page.getByText(/VIN match/i)).toBeVisible();

    // Spread + recommendation.
    await expect(page.getByText(/headroom/i)).toBeVisible();
    await expect(page.getByText("$6,600")).toBeVisible();
    await expect(page.getByText("Strong Buy")).toBeVisible();

    // Heuristic disclosure must always accompany the recommendation.
    await expect(page.getByText(/heuristic — not the production buy-box score/i)).toBeVisible();
  });

  test("too-short VIN shows the inline validation error and never calls /api/app/mmr/vin", async ({
    page,
  }) => {
    let mmrRequestCount = 0;
    await page.route("**/api/app/mmr/vin", (route) => {
      mmrRequestCount += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: { mmrValue: 0, confidence: "low", method: null },
        }),
      });
    });

    await page.goto("/mmr-lab");
    await page.getByLabel(/^VIN/i).fill("ABC123");
    await page.getByRole("button", { name: /look up mmr/i }).click();

    // Inline validation alert.
    const formAlert = page.getByRole("alert").filter({ hasText: /VIN must be 11–17 characters/ });
    await expect(formAlert).toBeVisible();

    // Result panel still shows the placeholder — no lookup state was set.
    await expect(page.getByText(/Run a VIN lookup to see the Cox MMR value/i)).toBeVisible();

    // The mock route was never hit.
    expect(mmrRequestCount).toBe(0);
  });
});
