import type { Env } from "../types/env";
import { log } from "../logging/logger";
import type { LogContext } from "../logging/logger";

export interface ExcellentLeadSummary {
  leadId: string;
  finalScore: number;
  year?: number;
  make?: string;
  model?: string;
  region: string;
  listingUrl: string;
  listingPrice?: number;
}

// Sends a Twilio SMS to ALERT_TO_NUMBER. Returns false (does not throw) on failure.
export async function sendSmsAlert(env: Env, message: string, logCtx?: LogContext): Promise<boolean> {
  if (
    !env.TWILIO_ACCOUNT_SID || env.TWILIO_ACCOUNT_SID === "replace_me" ||
    !env.TWILIO_AUTH_TOKEN || env.TWILIO_AUTH_TOKEN === "replace_me" ||
    !env.TWILIO_FROM_NUMBER || env.TWILIO_FROM_NUMBER === "replace_me" ||
    !env.ALERT_TO_NUMBER || env.ALERT_TO_NUMBER === "replace_me"
  ) return false;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const credentials = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  const body = new URLSearchParams({
    To: env.ALERT_TO_NUMBER,
    From: env.TWILIO_FROM_NUMBER,
    Body: message,
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      log("alert.sms_failed", { status: res.status, reason_code: "twilio_http_error" }, logCtx);
    }
    return res.ok;
  } catch (err) {
    log("alert.sms_failed", { reason_code: "network_timeout", error: err instanceof Error ? err.message : String(err) }, logCtx);
    return false;
  }
}

// POSTs a JSON payload to ALERT_WEBHOOK_URL. Returns false (does not throw) on failure.
export async function sendWebhookAlert(env: Env, payload: Record<string, unknown>, logCtx?: LogContext): Promise<boolean> {
  if (!env.ALERT_WEBHOOK_URL || env.ALERT_WEBHOOK_URL === "replace_me") return false;

  try {
    const res = await fetch(env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      log("alert.webhook_failed", { status: res.status, reason_code: "webhook_http_error" }, logCtx);
    }
    return res.ok;
  } catch (err) {
    log("alert.webhook_failed", { reason_code: "network_timeout", error: err instanceof Error ? err.message : String(err) }, logCtx);
    return false;
  }
}

// Composes and dispatches an excellent-lead alert via SMS + webhook in parallel.
// No-op when leads is empty. Never throws.
export async function sendExcellentLeadSummary(
  env: Env,
  leads: ExcellentLeadSummary[],
  context: { runId: string; source: string },
): Promise<void> {
  if (leads.length === 0) return;

  const lines = leads.map((l) => {
    const ymm = [l.year, l.make, l.model].filter(Boolean).join(" ") || "Unknown vehicle";
    const price = l.listingPrice != null ? ` | $${l.listingPrice.toLocaleString("en-US")}` : "";
    return `${ymm}${price} | Score ${l.finalScore} | ${l.region} | Lead ${l.leadId}`;
  });

  const heading =
    leads.length === 1
      ? `TAV: 1 excellent lead (${context.source})`
      : `TAV: ${leads.length} excellent leads (${context.source})`;

  const smsBody = [heading, ...lines].join("\n");

  const webhookPayload: Record<string, unknown> = {
    event: "excellent_leads",
    run_id: context.runId,
    source: context.source,
    count: leads.length,
    leads,
  };

  const alertCtx: LogContext = { runId: context.runId, source: context.source };

  const results = await Promise.allSettled([
    sendSmsAlert(env, smsBody, alertCtx),
    sendWebhookAlert(env, webhookPayload, alertCtx),
  ]);
  for (const result of results) {
    if (result.status === "rejected") {
      log("alert.dispatch_failed", { reason_code: "unhandled_rejection", error: String(result.reason) }, alertCtx);
    }
  }
}
