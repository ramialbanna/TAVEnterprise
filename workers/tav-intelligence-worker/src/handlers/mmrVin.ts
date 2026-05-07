import { okResponse } from "../types/api";
import { AuthError, ValidationError } from "../errors";
import { MmrVinLookupRequestSchema } from "../validate";
import type { HandlerArgs } from "./types";

/**
 * POST /mmr/vin — VIN-based MMR lookup. Phase F.1 SCAFFOLD ONLY.
 *
 * Validates the request body, requires Cloudflare Access identity, and
 * returns a well-formed envelope marked `error_code: "not_implemented"`
 * so callers can integrate end-to-end against the contract before Phase G
 * brings real Manheim fetches.
 */
export async function handleMmrVin(args: HandlerArgs): Promise<Response> {
  if (args.userContext.email === null) {
    throw new AuthError("Cloudflare Access identity required");
  }

  const body = await readJsonBody(args.request);
  const parsed = MmrVinLookupRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid /mmr/vin request body",
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
    error_message:       "MMR VIN lookup is scaffolded only; real fetch lands in Phase G.",
  };
}
