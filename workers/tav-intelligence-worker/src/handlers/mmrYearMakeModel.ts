import { okResponse } from "../types/api";
import { AuthError, ValidationError } from "../errors";
import { MmrYearMakeModelLookupRequestSchema } from "../validate";
import type { HandlerArgs } from "./types";

/**
 * POST /mmr/year-make-model — YMM-based MMR lookup. Phase F.1 SCAFFOLD ONLY.
 */
export async function handleMmrYearMakeModel(args: HandlerArgs): Promise<Response> {
  if (args.userContext.email === null) {
    throw new AuthError("Cloudflare Access identity required");
  }

  const body = await readJsonBody(args.request);
  const parsed = MmrYearMakeModelLookupRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid /mmr/year-make-model request body",
      parsed.error.flatten(),
    );
  }

  return okResponse(buildScaffoldEnvelope(), args.requestId);
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Request body is not valid JSON");
  }
}

function buildScaffoldEnvelope(): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    ok:                  false,
    mmr_value:           null,
    mileage_used:        0,
    is_inferred_mileage: false,
    cache_hit:           false,
    source:              "manheim",
    fetched_at:          now,
    expires_at:          null,
    error_code:          "not_implemented",
    error_message:       "MMR Y/M/M lookup is scaffolded only; real fetch lands in Phase G.",
  };
}
