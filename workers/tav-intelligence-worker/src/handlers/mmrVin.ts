import { okResponse } from "../types/api";
import { AuthError, ValidationError } from "../errors";
import { MmrVinLookupRequestSchema } from "../validate";
import { canForceRefresh } from "../auth/userContext";
import { performMmrLookup } from "../services/mmrLookup";
import { buildMmrLookupDeps } from "../services/mmrLookupDeps";
import type { HandlerArgs } from "./types";

/**
 * POST /mmr/vin — VIN-based Manheim MMR lookup.
 *
 * Validates the request body, requires Cloudflare Access identity, calls
 * the MMR orchestration service, and returns the result envelope. All
 * Postgres persistence is best-effort and never blocks the response.
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

  if (parsed.data.force_refresh && !canForceRefresh(args.userContext, args.env.MANAGER_EMAIL_ALLOWLIST)) {
    throw new AuthError("force_refresh requires manager role or allowlist membership");
  }

  // VIN is the canonical identity for year/make/model on the Cox MMR side; we do NOT
  // fabricate a current-year fallback here. `performMmrLookup` accepts an optional
  // `year` on the VIN branch and only consults the clock locally if mileage inference
  // has to run (which only fires when `mileage` is also absent).
  const envelope = await performMmrLookup(
    {
      input: {
        kind:    "vin",
        vin:     parsed.data.vin,
        ...(parsed.data.year !== undefined ? { year: parsed.data.year } : {}),
        ...(parsed.data.mileage !== undefined ? { mileage: parsed.data.mileage } : {}),
      },
      requestId:    args.requestId,
      forceRefresh: parsed.data.force_refresh,
      userContext:  args.userContext,
    },
    buildMmrLookupDeps(args.env),
  );

  return okResponse(envelope, args.requestId);
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Request body is not valid JSON");
  }
}
