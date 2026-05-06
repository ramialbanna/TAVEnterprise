import type { Env } from "../types/env";

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
export async function sendSmsAlert(env: Env, message: string): Promise<boolean> {
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
    });
    return res.ok;
  } catch {
    return false;
  }
}

// POSTs a JSON payload to ALERT_WEBHOOK_URL. Returns false (does not throw) on failure.
export async function sendWebhookAlert(env: Env, payload: Record<string, unknown>): Promise<boolean> {
  if (!env.ALERT_WEBHOOK_URL || env.ALERT_WEBHOOK_URL === "replace_me") return false;

  try {
    const res = await fetch(env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
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
    const price = l.listingPrice != null ? ` | $${l.listingPrice.toLocaleString()}` : "";
    return `${ymm}${price} | Score ${l.finalScore} | ${l.region}`;
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
    leads: leads.map((l) => ({ ...l })),
  };

  await Promise.allSettled([
    sendSmsAlert(env, smsBody),
    sendWebhookAlert(env, webhookPayload),
  ]);
}
