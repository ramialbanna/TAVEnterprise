import { expect, test } from "@playwright/test";

test.describe("sign-in page", () => {
  test("renders the product name, the Google sign-in button, and the domain notice", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("heading", { name: /TAV Acquisition Intelligence/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in with google/i })).toBeVisible();
    await expect(page.getByText(/texasautovalue\.com/i).first()).toBeVisible();
  });

  test("?error=AccessDenied shows the access-denied message", async ({ page }) => {
    await page.goto("/signin?error=AccessDenied");
    await expect(page.getByRole("alert").filter({ hasText: /access denied/i })).toBeVisible();
  });
});
