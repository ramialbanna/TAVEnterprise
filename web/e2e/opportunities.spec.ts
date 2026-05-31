import { expect, test } from "@playwright/test";

import { setAuthCookie } from "./helpers/auth";
import { mockAppApi } from "./helpers/app-api-mocks";

async function setInterfaceMode(page: import("@playwright/test").Page, mode: "classic" | "new") {
  await page.addInitScript((value) => {
    window.localStorage.setItem("tav.interface", value);
    window.localStorage.setItem("tav.opportunities.tour.dismissed", "1");
  }, mode);
}

test.describe("/opportunities — Classic (unchanged)", () => {
  test.beforeEach(async ({ context, page }) => {
    await setAuthCookie(context);
    await setInterfaceMode(page, "classic");
    await mockAppApi(page);
  });

  test("renders the classic queue table and submit dialog", async ({ page }) => {
    await page.goto("/opportunities");

    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: /^Opportunities$/i })).toBeVisible();
    await expect(main.getByRole("button", { name: /Submit listing/i })).toBeVisible();
    await expect(main.getByText("2019 Honda Civic EX")).toBeVisible();
    await expect(main.getByText(/Double-click or use the preview link/i)).toBeVisible();
  });
});

test.describe("/opportunities — New happy path", () => {
  test.beforeEach(async ({ context, page }) => {
    await setAuthCookie(context);
    await setInterfaceMode(page, "new");
    await mockAppApi(page);
  });

  test("renders queue tabs, summary, and opens preview on row click", async ({ page }) => {
    await page.goto("/opportunities");

    const main = page.getByRole("main");
    await expect(main.getByText("Your day at a glance")).toBeVisible();
    await expect(main.getByRole("tab", { name: /Needs action/i })).toBeVisible();
    await expect(main.getByText("2019 Honda Civic EX")).toBeVisible();

    await main.getByText("2019 Honda Civic EX").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("link", { name: /View listing/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open full page/i })).toBeVisible();
  });

});

test.describe("/opportunities — New empty state", () => {
  test.beforeEach(async ({ context, page }) => {
    await setAuthCookie(context);
    await setInterfaceMode(page, "new");
    await mockAppApi(page, { opportunitiesEmpty: true });
  });

  test("shows enriched empty state on Mine tab when empty", async ({ page }) => {
    await page.goto("/opportunities?view=mine");

    await expect(page.getByText("Nothing assigned to you yet")).toBeVisible();
    await expect(page.getByRole("link", { name: /See needs action/i })).toBeVisible();
  });
});
