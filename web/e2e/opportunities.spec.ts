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

  test("renders queue tabs, summary, and opens detail page on row click", async ({ page }) => {
    await page.goto("/opportunities");

    const main = page.getByRole("main");
    await expect(main.getByText("Your day at a glance")).toBeVisible();
    await expect(main.getByRole("tab", { name: /Needs action/i })).toBeVisible();
    await expect(main.getByText("2019 Honda Civic EX")).toBeVisible();

    await main.getByText("2019 Honda Civic EX").click();
    await expect(page).toHaveURL(/\/opportunities\/opp_e2e_1$/);
    await expect(
      page.getByRole("heading", { name: "2019 Honda Civic EX", level: 1 }),
    ).toBeVisible();
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

test.describe("/opportunities/:id — Detail page", () => {
  test.beforeEach(async ({ context, page }) => {
    await setAuthCookie(context);
    await setInterfaceMode(page, "new");
    await mockAppApi(page);
  });

  test("renders collapsible blocks and allows vehicle field edit + save", async ({ page }) => {
    await page.goto("/opportunities/opp_e2e_1");

    const main = page.getByRole("main");
    // Collapsible blocks all open by default.
    await expect(main.getByRole("heading", { name: "Vehicle" })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Listing" })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Valuation" })).toBeVisible();
    await expect(
      main.getByRole("heading", { name: "Salesperson / Appraisal Information" }),
    ).toBeVisible();
    await expect(main.getByRole("heading", { name: "Title Information" })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Contact Information" })).toBeVisible();

    // Vehicle fields seeded from opportunity.
    const vinInput = main.getByLabel("VIN");
    await expect(vinInput).toHaveValue("2HGFC2FAC");

    // Edit color and save.
    const colorInput = main.getByLabel("Color");
    await colorInput.fill("Red");
    await main.getByRole("button", { name: "Save", exact: true }).click();

    // Saved toast.
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 5000 });
  });

  test("auto-runs MMR + Max buy valuation on load when identity is sufficient", async ({ page }) => {
    await page.goto("/opportunities/opp_e2e_1");

    // The Valuation block should show the running skeleton, then the MMR result.
    const main = page.getByRole("main");
    await expect(main.getByText(/Running MMR/i)).toBeVisible({ timeout: 8000 });
  });

  test("shows insufficient-identity note when VIN/YMM are missing", async ({ page }) => {
    await page.goto("/opportunities/opp_e2e_2");

    const main = page.getByRole("main");
    await expect(main.getByText(/Add a VIN or year\/make\/model/i)).toBeVisible({ timeout: 8000 });
  });
});
