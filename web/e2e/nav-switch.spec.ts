import { expect, test } from "@playwright/test";

import { setAuthCookie } from "./helpers/auth";
import { mockAppApi } from "./helpers/app-api-mocks";

/**
 * Item 58 — menu destinations must paint chrome without waiting on Worker SQL.
 */
test.describe("sidebar nav chrome (#58)", () => {
  test.beforeEach(async ({ context, page }) => {
    await setAuthCookie(context);
    await page.addInitScript(() => {
      window.localStorage.setItem("tav.opportunities.tour.dismissed", "1");
    });
    await mockAppApi(page);
  });

  test("switch paints Opportunities chrome immediately, then Home on the way back", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Home" })).toBeVisible();

    await page.getByRole("link", { name: "Opportunities" }).click();
    await expect(main.getByRole("heading", { name: /^Opportunities$/i })).toBeVisible({
      timeout: 3_000,
    });
    await expect(main.getByText(/2019 Honda Civic/)).toBeVisible();

    await page.getByRole("link", { name: "Home" }).click();
    await expect(main.getByRole("heading", { name: "Home" })).toBeVisible({ timeout: 3_000 });
  });

  test("buyer menu destinations paint their chrome without waiting on SQL", async ({ page }) => {
    await page.goto("/dashboard");
    const main = page.getByRole("main");

    await page.getByRole("link", { name: "Submit listing" }).click();
    await expect(main.getByRole("heading", { name: /Submit a listing/i })).toBeVisible({
      timeout: 3_000,
    });

    await page.getByRole("link", { name: "TAV MMR" }).click();
    await expect(main.getByText("MMR", { exact: true })).toBeVisible({ timeout: 3_000 });

    await page.getByRole("link", { name: "Analytics" }).click();
    await expect(main.getByRole("heading", { name: /^Analytics$/i })).toBeVisible({
      timeout: 3_000,
    });
  });
});
