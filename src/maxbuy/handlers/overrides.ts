import { MaxbuyOverrideRequestSchema } from "../api/schemas";
import { insertOverride } from "../persistence/recommendations";
import type { MaxbuyWorkerEnv } from "../types/env";
import { getSupabaseClient } from "../../persistence/supabase";
import { json, readJsonBody } from "./http";

export async function handleMaxbuyOverride(
  request: Request,
  env: MaxbuyWorkerEnv,
  userId: string,
): Promise<Response> {
  if (env.MAXBUY_EVALUATE_ENABLED !== "true") {
    return json({ ok: false, error: "maxbuy_disabled" }, 503);
  }

  const body = await readJsonBody(request);
  const parsed = MaxbuyOverrideRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: "validation_error", issues: parsed.error.issues.slice(0, 5) }, 400);
  }

  const db = getSupabaseClient(env);
  const overrideId = await insertOverride(db, {
    recommendationId: parsed.data.recommendation_id,
    buyerUserId: userId,
    overrideType: parsed.data.override_type,
    overrideNote: parsed.data.override_note,
    actedPrice: parsed.data.acted_price,
  });

  return json({ ok: true, data: { override_id: overrideId } });
}
