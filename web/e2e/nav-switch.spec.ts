import { expect, test } from "@playwright/test";

import { setAuthCookie } from "./helpers/auth";
import { mockAppApi } from "./helpers/app-api-mocks";

/**
 * Item 58 — Home ↔ Opportunities must paint the destination chrome without
 * waiting on Worker SQL. Queue rows may still arrive after paint.
 */
test.describe("Home ↔ Opportunities nav (#58)", () => {
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
});
