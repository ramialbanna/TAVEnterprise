import { expect, type Page, test } from "@playwright/test";

import { setAuthCookie } from "./helpers/auth";

const VALID_VIN = "1FT8W3BT1SEC27066";
const SCREENSHOT_DIR = "e2e/__screenshots__";

async function mockCatalog(page: Page) {
  await page.route("**/api/app/mmr/catalog/years**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { items: ["2026"], catalogState: "connected", cached: false, reason: null },
      }),
    }),
  );
  await page.route("**/api/app/mmr/catalog/makes**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { items: ["TESLA"], catalogState: "connected", cached: false, reason: null },
      }),
    }),
  );
  await page.route("**/api/app/mmr/catalog/models**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { items: ["MODEL Y AWD"], catalogState: "connected", cached: false, reason: null },
      }),
    }),
  );
  await page.route("**/api/app/mmr/catalog/styles**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { items: ["4D SUV PERFORMANCE"], catalogState: "connected", cached: false, reason: null },
      }),
    }),
  );
}

test.describe("/mmr-lab (authenticated, live Cox catalog)", () => {
  test.beforeEach(async ({ context }) => {
    await setAuthCookie(context);
  });

  test("empty state: live catalog loads, no Fill example, no fabricated money", async ({
    page,
  }) => {
    const vendorCalls: string[] = [];
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("manheim.com") || u.includes("coxautoinc.com")) vendorCalls.push(u);
    });
    await mockCatalog(page);

    await page.goto("/mmr-lab");
    const main = page.getByRole("main");
    await expect(main.getByText(/^MMR$/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /fill example/i })).toHaveCount(0);
    await expect(page.getByText(/strong buy|recommendation/i)).toHaveCount(0);
    await expect(page.getByLabel("Year", { exact: true }).locator("option")).toHaveText([
      "Year",
      "2026",
    ]);
    await expect(page.getByText(/\$\d/)).toHaveCount(0);
    expect(vendorCalls).toEqual([]);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/mmr-lab-empty.png`, fullPage: true });
  });

  test("Y/M/M/S path values the selected vehicle via /api/app/mmr/ymm", async ({
    page,
  }) => {
    await mockCatalog(page);
    let ymmCalls = 0;
    let postedBody: unknown = null;
    const vendorCalls: string[] = [];
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("manheim.com") || u.includes("coxautoinc.com")) vendorCalls.push(u);
    });
    await page.route("**/api/app/mmr/ymm", async (route) => {
      ymmCalls += 1;
      postedBody = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            mmrValue: 23900,
            confidence: "medium",
            method: "year_make_model",
            mileageUsed: 70740,
            avgOdometer: 70740,
            avgCondition: 3.9,
            rangeLow: 22700,
            rangeHigh: 25100,
            adjustedMmr: 23900,
            retailValue: 26600,
            retailRangeLow: 23500,
            retailRangeHigh: 29800,
          },
        }),
      });
    });

    await page.goto("/mmr-lab");
    await page.getByLabel("Year", { exact: true }).selectOption("2026");
    await expect(page.getByLabel("Make", { exact: true }).locator("option")).toHaveText([
      "Make",
      "TESLA",
    ]);
    await page.getByLabel("Make", { exact: true }).selectOption("TESLA");
    await expect(page.getByLabel("Model", { exact: true }).locator("option")).toHaveText([
      "Model",
      "MODEL Y AWD",
    ]);
    await page.getByLabel("Model", { exact: true }).selectOption("MODEL Y AWD");
    await expect(page.getByLabel("Style", { exact: true }).locator("option")).toHaveText([
      "Style",
      "4D SUV PERFORMANCE",
    ]);
    await page.getByLabel("Style", { exact: true }).selectOption("4D SUV PERFORMANCE");
    await page.getByRole("button", { name: /value selected vehicle/i }).click();

    await expect(page.getByText("2026 TESLA MODEL Y AWD 4D SUV PERFORMANCE")).toBeVisible();
    await expect(page.getByText("$23,900").first()).toBeVisible();
    await expect(page.getByText("$22,700 - $25,100")).toBeVisible();
    await expect(page.getByText("$26,600")).toBeVisible();
    await expect(page.getByText("$23,500 - $29,800")).toBeVisible();
    expect(ymmCalls).toBe(1);
    expect(postedBody).toEqual({
      year: 2026,
      make: "TESLA",
      model: "MODEL Y AWD",
      style: "4D SUV PERFORMANCE",
    });
    expect(vendorCalls).toEqual([]);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/mmr-lab-ymm.png`, fullPage: true });
  });

  test("catalog not connected keeps selectors disabled and never injects samples", async ({
    page,
  }) => {
    await page.route("**/api/app/mmr/catalog/years**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: { items: [], catalogState: "not_connected", cached: false, reason: "not_provisioned" },
        }),
      }),
    );

    await page.goto("/mmr-lab");
    await expect(page.getByText(/live catalog not connected/i)).toBeVisible();
    for (const label of ["Year", "Make", "Model", "Style"]) {
      const sel = page.getByLabel(label, { exact: true });
      await expect(sel).toBeDisabled();
      await expect(sel.locator("option")).toHaveCount(1);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/mmr-lab-disabled.png`, fullPage: true });
  });

  test("VIN path still populates Base MMR without browser-to-vendor calls", async ({
    page,
  }) => {
    await mockCatalog(page);
    let vinCalls = 0;
    const vendorCalls: string[] = [];
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("manheim.com") || u.includes("coxautoinc.com")) vendorCalls.push(u);
    });
    await page.route("**/api/app/mmr/vin", (route) => {
      vinCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: { mmrValue: 48600, confidence: "high", method: "vin" },
        }),
      });
    });

    await page.goto("/mmr-lab");
    await page.getByPlaceholder(/enter vin/i).fill(VALID_VIN);
    await page.getByRole("button", { name: /search/i }).click();

    await expect(page.getByText("$48,600")).toBeVisible();
    await expect(page.getByText(/^high$/i)).toBeVisible();
    expect(vinCalls).toBe(1);
    expect(vendorCalls).toEqual([]);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/mmr-lab-vin.png`, fullPage: true });
  });

  test("too-short VIN does not call /api/app/mmr/vin", async ({ page }) => {
    await mockCatalog(page);
    let vinCalls = 0;
    await page.route("**/api/app/mmr/vin", (route) => {
      vinCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { mmrValue: 0, confidence: "low", method: null } }),
      });
    });

    await page.goto("/mmr-lab");
    await page.getByPlaceholder(/enter vin/i).fill("SHORT");
    await page.getByRole("button", { name: /search/i }).click();
    await page.waitForTimeout(250);

    expect(vinCalls).toBe(0);
    await expect(page.getByText(/\$\d/)).toHaveCount(0);
  });

  test("YMM unavailable shows honest UnavailableState, not fabricated money", async ({
    page,
  }) => {
    await mockCatalog(page);
    await page.route("**/api/app/mmr/ymm", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: { mmrValue: null, missingReason: "no_mmr_value" },
        }),
      }),
    );

    await page.goto("/mmr-lab");
    await page.getByLabel("Year", { exact: true }).selectOption("2026");
    await expect(page.getByLabel("Make", { exact: true }).locator("option")).toHaveText([
      "Make",
      "TESLA",
    ]);
    await page.getByLabel("Make", { exact: true }).selectOption("TESLA");
    await expect(page.getByLabel("Model", { exact: true }).locator("option")).toHaveText([
      "Model",
      "MODEL Y AWD",
    ]);
    await page.getByLabel("Model", { exact: true }).selectOption("MODEL Y AWD");
    await expect(page.getByLabel("Style", { exact: true }).locator("option")).toHaveText([
      "Style",
      "4D SUV PERFORMANCE",
    ]);
    await page.getByLabel("Style", { exact: true }).selectOption("4D SUV PERFORMANCE");
    await page.getByRole("button", { name: /value selected vehicle/i }).click();

    await expect(page.getByText(/no MMR value was returned/i)).toBeVisible();
    await expect(page.getByText(/\$\d/)).toHaveCount(0);
  });

  test("prefills VIN from query string", async ({ page }) => {
    await mockCatalog(page);
    await page.goto(`/mmr-lab?vin=${VALID_VIN}`);
    await expect(page.getByLabel("VIN", { exact: true })).toHaveValue(VALID_VIN);
  });

  test("/maxbuy redirects to /mmr-lab", async ({ page }) => {
    await mockCatalog(page);
    await page.goto("/maxbuy");
    await expect(page).toHaveURL(/\/mmr-lab$/);
    await expect(page.getByRole("main").getByText(/^MMR$/).first()).toBeVisible();
  });

  test("YMM search shows live historical and projected averages when Cox returns market context", async ({
    page,
  }) => {
    await mockCatalog(page);
    await page.route("**/api/app/mmr/ymm", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            mmrValue: 23900,
            confidence: "medium",
            method: "year_make_model",
            mileageUsed: 70740,
            adjustedMmr: 23900,
            historicalAverages: {
              past30Days: { price: 18900, avgMileage: 65563 },
              sixMonthsAgo: { price: 18250, avgMileage: 57567 },
              lastYear: { price: 21900, avgMileage: 51440 },
            },
            projectedAverage: { price: 19100, avgMileage: null },
            transactions: [],
          },
        }),
      }),
    );

    await page.goto("/mmr-lab");
    await page.getByLabel("Year", { exact: true }).selectOption("2026");
    await page.getByLabel("Make", { exact: true }).selectOption("TESLA");
    await page.getByLabel("Model", { exact: true }).selectOption("MODEL Y AWD");
    await page.getByLabel("Style", { exact: true }).selectOption("4D SUV PERFORMANCE");
    await page.getByRole("button", { name: /value selected vehicle/i }).click();

    await expect(page.getByRole("heading", { name: /historical average/i })).toBeVisible();
    await expect(page.getByText("$18,900")).toBeVisible();
    await expect(page.getByText("$19,100")).toBeVisible();
    await expect(page.getByText("65,563 mi")).toBeVisible();
    await expect(page.getByText(/no wholesale auction comps returned/i)).toBeVisible();
  });
});
