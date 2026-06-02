import { MaxbuyEvaluateRequestSchema } from "../api/schemas";
import { runEvaluate } from "../evaluateRun";
import type { MaxbuyWorkerEnv } from "../types/env";
import { json, readJsonBody } from "./http";

export async function handleMaxbuyEvaluate(
  request: Request,
  env: MaxbuyWorkerEnv,
  userId: string,
): Promise<Response> {
  if (env.MAXBUY_EVALUATE_ENABLED !== "true") {
    return json({ ok: false, error: "maxbuy_disabled" }, 503);
  }

  const body = await readJsonBody(request);
  const parsed = MaxbuyEvaluateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: "validation_error", issues: parsed.error.issues.slice(0, 5) }, 400);
  }

  try {
    const result = await runEvaluate(env, userId, parsed.data);
    if (!result.ok) {
      const status = result.error.code === "invalid_vin" ? 400 : 422;
      return json({ ok: false, error: result.error.code, message: result.error.message }, status);
    }
    return json({ ok: true, data: result.data });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : JSON.stringify(err);
    return json({ ok: false, error: "internal_error", message }, 500);
  }
}
