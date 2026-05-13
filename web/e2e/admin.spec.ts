import { expect, test } from "@playwright/test";

import type { SystemStatus } from "@/lib/app-api/schemas";

import { setAuthCookie, DEFAULT_E2E_USER } from "./helpers/auth";
import { E2E_SYSTEM_STATUS, mockAppApi } from "./helpers/app-api-mocks";

const COX_CAVEAT =
  "Cox MMR is currently sandbox-backed in production until Cox enables true production MMR credentials.";

const NEVER_RUN_STATUS: SystemStatus = {
  ...E2E_SYSTEM_STATUS,
  staleSweep: { lastRunAt: null, missingReason: "never_run" },
};

const DB_DOWN_STATUS: SystemStatus = {
  ...E2E_SYSTEM_STATUS,
  db: { ok: false, missingReason: "db_error" },
  sources: [],
  staleSweep: { lastRunAt: null, missingReason: "db_error" },
};

/**
 * Admin/integrations e2e — gates `/admin` behind the playwright auth cookie and stubs
 * `/api/app/system-status` (both the SSR first paint via `/api/e2e-mocks/app/*` and the
 * client refetch via `page.route`). Asserts the section surface the operator sees:
 * signed-in email, environment label, the verbatim Cox-sandbox caveat string, a row of
 * the v_source_health fixture, the stale-sweep line, the secrets checklist (names only,
 * "not visible here", no secret values), and the Refresh button. Two failure variants —
 * `never_run` and `db.ok:false` — assert the degraded copy paths.
 */
test.describe("/admin (authenticated + mocked /api/app/*)", () => {
  test.beforeEach(async ({ context }) => {
    await setAuthCookie(context);
  });

  test("renders the admin surface from a healthy fixture", async ({ page }) => {
    await mockAppApi(page);
    await page.goto("/admin");

    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: /^Admin \/ Integrations$/i })).toBeVisible();

    // Signed-in user — name and email.
    await expect(main.getByText(DEFAULT_E2E_USER.email)).toBeVisible();
    await expect(main.getByText(DEFAULT_E2E_USER.name!)).toBeVisible();

    // Environment label — playwright dev server runs against 127.0.0.1 → LOCAL.
    await expect(main.getByText("LOCAL").first()).toBeVisible();
    await expect(main.getByText(/^127\.0\.0\.1:3000$/)).toBeVisible();

    // Cox/Manheim caveat — exact verbatim string.
    await expect(main.getByText(COX_CAVEAT, { exact: true })).toBeVisible();
    await expect(main.getByText(/Cox environment:/i)).toBeVisible();
    await expect(main.getByText("Sandbox-backed", { exact: true })).toBeVisible();

    // API health — db Healthy + service/version.
    await expect(main.getByText(/^Healthy$/).first()).toBeVisible();
    await expect(main.getByText("tav-aip", { exact: true })).toBeVisible();
    await expect(main.getByText("e2e-1.0.0", { exact: true })).toBeVisible();

    // Intel-worker — service binding label.
    await expect(main.getByText(/service binding active/i)).toBeVisible();

    // Source-run health — a row from the v_source_health fixture (facebook, 42).
    await expect(main.getByText("facebook", { exact: true })).toBeVisible();
    await expect(main.getByText("42", { exact: true })).toBeVisible();

    // Stale sweep — last-run line + "7 updated" from the fixture.
    await expect(main.getByText(/Last run/i)).toBeVisible();
    await expect(main.getByText(/7 updated/i)).toBeVisible();

    // Secrets checklist — names visible, "not visible here" label, no values.
    await expect(main.getByText("APP_API_SECRET")).toBeVisible();
    await expect(main.getByText("ADMIN_API_SECRET")).toBeVisible();
    await expect(main.getByText("WEBHOOK_HMAC_SECRET")).toBeVisible();
    await expect(main.getByText("INTEL_WORKER_SECRET")).toBeVisible();
    await expect(main.getByText("MANHEIM_CLIENT_ID")).toBeVisible();
    await expect(main.getByText("MANHEIM_CLIENT_SECRET")).toBeVisible();
    await expect(main.getByText("TWILIO_ACCOUNT_SID")).toBeVisible();
    await expect(main.getByText("SUPABASE_SERVICE_ROLE_KEY")).toBeVisible();
    await expect(main.getByText(/not visible here/i).first()).toBeVisible();

    // No secret value should appear in the visible admin surface. Scope to the
    // rendered <main> via `innerText` so the Next RSC payload (which lives in
    // `<script>` tags and carries hashed bundle names) is excluded.
    const visible = (await main.innerText()) ?? "";
    expect(visible).not.toMatch(/bearer\s+\S/i);
    expect(visible).not.toMatch(/authorization:/i);
    expect(visible).not.toMatch(/\b[A-Za-z0-9_-]{40,}\b/);

    // Refresh button — clickable, no other test buttons in v1.
    const refresh = main.getByRole("button", { name: /refresh system status/i });
    await expect(refresh).toBeVisible();
    await refresh.click();
  });

  test("never_run staleSweep shows the 'Never run' copy after a refresh", async ({ page }) => {
    // SSR first-paint runs against the in-process /api/e2e-mocks (healthy fixture).
    // page.route only intercepts the browser-side /api/app/* proxy URL, so to surface
    // the variant we click Refresh, which invalidates the system-status query and
    // triggers a client refetch through page.route → our override fixture.
    await mockAppApi(page, { systemStatus: NEVER_RUN_STATUS });
    await page.goto("/admin");

    const main = page.getByRole("main");
    await main.getByRole("button", { name: /refresh system status/i }).click();

    await expect(main.getByText(/^Never run$/i)).toBeVisible();
    await expect(main.getByText(/hasn't run yet/i)).toBeVisible();
  });

  test("db.ok:false shows Database error + empty source-health state after a refresh", async ({
    page,
  }) => {
    await mockAppApi(page, { systemStatus: DB_DOWN_STATUS });
    await page.goto("/admin");

    const main = page.getByRole("main");
    await main.getByRole("button", { name: /refresh system status/i }).click();

    await expect(main.getByText(/database error/i)).toBeVisible();
    await expect(main.getByText(/source health unavailable/i)).toBeVisible();
  });
});
