import { expect, test } from "@playwright/test";

test.describe("auth gate (proxy)", () => {
  test("an unauthenticated page request redirects to /signin with a callbackUrl", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/signin\?/);
    expect(page.url()).toContain("callbackUrl");
  });

  test("an unauthenticated /api/app/* request gets JSON 401, not the sign-in HTML", async ({ request }) => {
    const res = await request.get("/api/app/kpis");
    expect(res.status()).toBe(401);
    expect(res.headers()["content-type"] ?? "").toContain("application/json");
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });
});
