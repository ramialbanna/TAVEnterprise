import { expect, test } from "@playwright/test";

import { setAuthCookie } from "./helpers/auth";

/**
 * MMR Lab e2e — revised scope (Issue #44).
 *
 * The redesign is honest by construction:
 *   - VIN is the ONLY valuation path (browser → /api/app/mmr/vin → Worker).
 *   - Year/Make/Model/Style are visible but DISABLED ("live catalog not
 *     connected") — no hardcoded catalog, no scraping, no YMM endpoint.
 *   - Every money zone is `--` until a real VIN result populates Base MMR;
 *     the lean envelope only ever fills Base MMR.
 *
 * Assertions target operator-facing copy/values, not internal selectors.
 * Screenshots for the two honest states are written to a committed path.
 */

const VALID_VIN = "1FT8W3BT1SEC27066";
const SCREENSHOT_DIR = "e2e/__screenshots__";

test.describe("/mmr-lab (authenticated, revised scope)", () => {
  test.beforeEach(async ({ context }) => {
    await setAuthCookie(context);
  });

  test("empty state: -- everywhere, no Fill example, no /api/app call on load", async ({
    page,
  }) => {
    const appApiCalls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/app/")) appApiCalls.push(req.url());
    });

    await page.goto("/mmr-lab");
    const main = page.getByRole("main");

    // The "MMR" bar from SearchPanel is the page anchor.
    await expect(main.getByText(/^MMR$/).first()).toBeVisible();

    // No dummy prefill control anywhere.
    await expect(page.getByRole("button", { name: /fill example/i })).toHaveCount(0);
    await expect(page.getByText(/heuristic/i)).toHaveCount(0);
    await expect(page.getByText(/strong buy|recommendation/i)).toHaveCount(0);

    // Honest empties: Base MMR + right-panel zones all "--".
    expect(await page.getByText("--", { exact: true }).count()).toBeGreaterThanOrEqual(7);
    // No fabricated money.
    await expect(page.getByText(/\$\d/)).toHaveCount(0);

    // Nothing fetched the product API just by loading the page.
    expect(appApiCalls).toEqual([]);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/mmr-lab-empty.png`, fullPage: true });
  });

  test("Year/Make/Model/Style are visible but disabled (no catalog leaked)", async ({
    page,
  }) => {
    await page.goto("/mmr-lab");

    for (const label of ["Year", "Make", "Model", "Style"]) {
      const sel = page.getByLabel(label, { exact: true });
      await expect(sel).toBeVisible();
      await expect(sel).toBeDisabled();
      // Only the placeholder option — no catalog values shipped to the browser.
      await expect(sel.locator("option")).toHaveCount(1);
    }
    await expect(page.getByText(/live catalog not connected/i)).toBeVisible();

    // Honest disabled-state screenshot (design spec REVISION R1: empty + disabled-state).
    await page.screenshot({ path: `${SCREENSHOT_DIR}/mmr-lab-disabled.png`, fullPage: true });
  });

  test("disabled selectors fire NO /api/app request", async ({ page }) => {
    const appApiCalls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/app/")) appApiCalls.push(req.url());
    });

    await page.goto("/mmr-lab");
    // A disabled <select> can't be changed; force-clicking still must not fetch.
    await page.getByLabel("Year", { exact: true }).click({ force: true }).catch(() => {});
    await page.getByLabel("Make", { exact: true }).click({ force: true }).catch(() => {});
    await page.waitForTimeout(250);

    expect(appApiCalls).toEqual([]);
  });

  test("VIN path: mocked /api/app/mmr/vin populates ONLY Base MMR; other zones stay --", async ({
    page,
  }) => {
    let vinCalls = 0;
    const otherAppCalls: string[] = [];
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
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("/api/app/") && !u.includes("/api/app/mmr/vin")) otherAppCalls.push(u);
    });

    await page.goto("/mmr-lab");
    await page.getByPlaceholder(/enter vin/i).fill(VALID_VIN);
    await page.getByRole("button", { name: /search/i }).click();

    // Base MMR is the only populated money value.
    await expect(page.getByText("$48,600")).toBeVisible();
    await expect(page.getByText(/^high$/i)).toBeVisible();

    // Range / Adjusted / Estimated Retail / Typical Range still honest "--".
    expect(await page.getByText("--", { exact: true }).count()).toBeGreaterThanOrEqual(6);

    // Exactly one VIN call; no YMM/other product-API endpoint was hit.
    expect(vinCalls).toBe(1);
    expect(otherAppCalls).toEqual([]);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/mmr-lab-vin.png`, fullPage: true });
  });

  test("too-short VIN does not call /api/app/mmr/vin", async ({ page }) => {
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
    // Still empty/honest — no fabricated value.
    await expect(page.getByText(/\$\d/)).toHaveCount(0);
  });

  test("VIN unavailable (mmrValue:null) shows honest UnavailableState, not an error", async ({
    page,
  }) => {
    await page.route("**/api/app/mmr/vin", (route) =>
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
    await page.getByPlaceholder(/enter vin/i).fill(VALID_VIN);
    await page.getByRole("button", { name: /search/i }).click();

    // Honest business-unavailable copy (codeMessage("no_mmr_value")) — not a
    // thrown-error UI, and never a fabricated number.
    await expect(page.getByText(/no MMR value was returned/i)).toBeVisible();
    await expect(page.getByText(/\$\d/)).toHaveCount(0);
  });
});
