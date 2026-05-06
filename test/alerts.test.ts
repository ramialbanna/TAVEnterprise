import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendSmsAlert, sendWebhookAlert, sendExcellentLeadSummary } from "../src/alerts/alerts";
import type { ExcellentLeadSummary } from "../src/alerts/alerts";
import type { Env } from "../src/types/env";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-key",
    WEBHOOK_HMAC_SECRET: "test-secret",
    NORMALIZER_SECRET: "test-secret",
    MANHEIM_CLIENT_ID: "test",
    MANHEIM_CLIENT_SECRET: "test",
    MANHEIM_USERNAME: "test",
    MANHEIM_PASSWORD: "test",
    MANHEIM_TOKEN_URL: "https://api.manheim.com/oauth2/token.oauth2",
    MANHEIM_MMR_URL: "https://api.manheim.com/valuations",
    ALERT_WEBHOOK_URL: "https://hooks.example.com/tav-alerts",
    TWILIO_ACCOUNT_SID: "ACtest",
    TWILIO_AUTH_TOKEN: "auth-token",
    TWILIO_FROM_NUMBER: "+12125551000",
    ALERT_TO_NUMBER: "+12125559999",
    TAV_KV: {} as KVNamespace,
    ADMIN_API_SECRET: "admin-secret",
    HYBRID_BUYBOX_ENABLED: "true",
    ...overrides,
  };
}

const LEAD: ExcellentLeadSummary = {
  leadId: "lead-1",
  finalScore: 92,
  year: 2021,
  make: "Toyota",
  model: "Camry",
  region: "dallas_tx",
  listingUrl: "https://fb.com/item/1",
  listingPrice: 8500,
};

describe("sendSmsAlert", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs to Twilio Messages endpoint", async () => {
    const env = makeEnv();
    await sendSmsAlert(env, "test message");

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("api.twilio.com");
    expect(url).toContain("ACtest");
    expect((init.headers as Record<string, string>)["Authorization"]).toMatch(/^Basic /);
    expect(init.body).toContain("test+message");
  });

  it("skips fetch when TWILIO_ACCOUNT_SID is placeholder", async () => {
    const env = makeEnv({ TWILIO_ACCOUNT_SID: "replace_me" });
    const result = await sendSmsAlert(env, "test");
    expect(result).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips fetch when TWILIO_AUTH_TOKEN is placeholder", async () => {
    const env = makeEnv({ TWILIO_AUTH_TOKEN: "replace_me" });
    const result = await sendSmsAlert(env, "test");
    expect(result).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips fetch when TWILIO_FROM_NUMBER is placeholder", async () => {
    const env = makeEnv({ TWILIO_FROM_NUMBER: "replace_me" });
    const result = await sendSmsAlert(env, "test");
    expect(result).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips fetch when ALERT_TO_NUMBER is placeholder", async () => {
    const env = makeEnv({ ALERT_TO_NUMBER: "replace_me" });
    const result = await sendSmsAlert(env, "test");
    expect(result).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns false (does not throw) when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    const result = await sendSmsAlert(makeEnv(), "test");
    expect(result).toBe(false);
  });

  it("returns false and logs when Twilio returns non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    const spy = vi.spyOn(console, "log");
    const result = await sendSmsAlert(makeEnv(), "test");
    expect(result).toBe(false);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("alert.sms_failed"));
    spy.mockRestore();
  });
});

describe("sendWebhookAlert", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs JSON to ALERT_WEBHOOK_URL", async () => {
    await sendWebhookAlert(makeEnv(), { event: "test", count: 1 });

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.example.com/tav-alerts");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toMatchObject({ event: "test", count: 1 });
  });

  it("skips fetch when ALERT_WEBHOOK_URL is placeholder", async () => {
    const env = makeEnv({ ALERT_WEBHOOK_URL: "replace_me" });
    const result = await sendWebhookAlert(env, { event: "test" });
    expect(result).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns false (does not throw) when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const result = await sendWebhookAlert(makeEnv(), { event: "test" });
    expect(result).toBe(false);
  });

  it("returns false and logs when webhook returns non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const spy = vi.spyOn(console, "log");
    const result = await sendWebhookAlert(makeEnv(), { event: "test" });
    expect(result).toBe(false);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("alert.webhook_failed"));
    spy.mockRestore();
  });
});

describe("sendExcellentLeadSummary", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("fires no requests when leads array is empty", async () => {
    await sendExcellentLeadSummary(makeEnv(), [], { runId: "run-1", source: "facebook" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("SMS body includes vehicle, price, score, region, and leadId for single lead", async () => {
    await sendExcellentLeadSummary(makeEnv(), [LEAD], { runId: "run-1", source: "facebook" });

    const smsCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => (call[0] as string).includes("twilio"),
    );
    expect(smsCall).toBeDefined();
    const msgBody = new URLSearchParams(smsCall![1].body as string).get("Body") ?? "";
    expect(msgBody).toContain("Toyota");
    expect(msgBody).toContain("$8,500");
    expect(msgBody).toContain("92");
    expect(msgBody).toContain("dallas_tx");
    expect(msgBody).toContain("lead-1");
  });

  it("SMS heading uses plural form for multiple leads", async () => {
    const leads = [LEAD, { ...LEAD, leadId: "lead-2", finalScore: 88 }];
    await sendExcellentLeadSummary(makeEnv(), leads, { runId: "run-1", source: "facebook" });

    const smsCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => (call[0] as string).includes("twilio"),
    );
    const msgBody = new URLSearchParams(smsCall![1].body as string).get("Body") ?? "";
    expect(msgBody).toMatch(/2 excellent leads/);
  });

  it("webhook payload includes run_id, source, count, and lead list", async () => {
    await sendExcellentLeadSummary(makeEnv(), [LEAD], { runId: "run-42", source: "facebook" });

    const webhookCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => (call[0] as string).includes("hooks.example.com"),
    );
    expect(webhookCall).toBeDefined();
    const payload = JSON.parse(webhookCall![1].body as string);
    expect(payload).toMatchObject({
      event: "excellent_leads",
      run_id: "run-42",
      source: "facebook",
      count: 1,
    });
    expect(payload.leads).toHaveLength(1);
  });

  it("does not throw when one channel fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) =>
        url.includes("twilio")
          ? Promise.reject(new Error("twilio down"))
          : Promise.resolve({ ok: true }),
      ),
    );
    await expect(
      sendExcellentLeadSummary(makeEnv(), [LEAD], { runId: "run-1", source: "facebook" }),
    ).resolves.toBeUndefined();
  });

  it("resolves when both channels fail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(
      sendExcellentLeadSummary(makeEnv(), [LEAD], { runId: "run-1", source: "facebook" }),
    ).resolves.toBeUndefined();
  });
});
