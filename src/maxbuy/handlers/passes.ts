import { MaxbuyPassRequestSchema } from "../api/schemas";
import { insertPass } from "../persistence/recommendations";
import type { MaxbuyWorkerEnv } from "../types/env";
import { getSupabaseClient } from "../../persistence/supabase";
import { json, readJsonBody } from "./http";

export async function handleMaxbuyPass(
  request: Request,
  env: MaxbuyWorkerEnv,
  userId: string,
): Promise<Response> {
  if (env.MAXBUY_EVALUATE_ENABLED !== "true") {
    return json({ ok: false, error: "maxbuy_disabled" }, 503);
  }

  const body = await readJsonBody(request);
  const parsed = MaxbuyPassRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: "validation_error", issues: parsed.error.issues.slice(0, 5) }, 400);
  }

  const db = getSupabaseClient(env);
  const passReason = parsed.data.pass_note
    ? `${parsed.data.pass_reason} — ${parsed.data.pass_note}`.slice(0, 128)
    : parsed.data.pass_reason;

  const passId = await insertPass(db, {
    vin: parsed.data.vin ?? null,
    year: parsed.data.year,
    make: parsed.data.make,
    model: parsed.data.model,
    recommendationId: parsed.data.recommendation_id,
    askingPrice: parsed.data.asking_price,
    bidPrice: parsed.data.bid_price,
    mmrValue: parsed.data.mmr_value,
    buyerUserId: userId,
    passReason,
  });

  return json({ ok: true, data: { pass_id: passId } });
}
