import { verifyBearer } from "../auth/bearerAuth";
import { isConfiguredSecret } from "../types/envValidation";
import type { Env } from "../types/env";
import { sendSmsTo } from "./alerts";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function sellerHaltSmsBody(reason: string): string {
  if (reason === "login_wall") {
    return "TAV: seller check stopped. Facebook is asking the lookup account to log in. New leads stay Seller unchecked until that account is confirmed and the pause is cleared.";
  }
  return "TAV: seller check stopped. Facebook locked the lookup account. New leads stay Seller unchecked until that account is confirmed and the pause is cleared.";
}

/**
 * POST /internal/seller-enrich-halt
 * Called once by the Fly seller lookup when Facebook locks the account.
 */
export async function handleSellerEnrichHalt(request: Request, env: Env): Promise<Response> {
  if (!isConfiguredSecret(env.HALT_ALERT_SECRET)) {
    return json({ ok: false, error: "not_configured" }, 503);
  }
  if (!verifyBearer(request, env.HALT_ALERT_SECRET)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let reason = "checkpoint";
  try {
    const body = (await request.json()) as { reason?: unknown };
    if (body.reason === "login_wall" || body.reason === "checkpoint") reason = body.reason;
  } catch {
    // Empty body still sends the checkpoint text.
  }

  const to = env.HALT_ALERT_SMS_TO ?? "";
  const sent = await sendSmsTo(env, to, sellerHaltSmsBody(reason));
  if (!sent) return json({ ok: false, error: "sms_failed" }, 502);
  return json({ ok: true }, 200);
}
