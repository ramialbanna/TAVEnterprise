import { okResponse } from "../types/api";
import { AuthError, ValidationError } from "../errors";
import { MmrYearMakeModelLookupRequestSchema } from "../validate";
import { canForceRefresh } from "../auth/userContext";
import { performMmrLookup } from "../services/mmrLookup";
import { buildMmrLookupDeps } from "../services/mmrLookupDeps";
import type { HandlerArgs } from "./types";

/**
 * POST /mmr/year-make-model — YMM-based Manheim MMR lookup.
 *
 * Validates the request body, requires Cloudflare Access identity, calls
 * the MMR orchestration service, and returns the result envelope. All
 * Postgres persistence is best-effort and never blocks the response.
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

  if (parsed.data.force_refresh && !canForceRefresh(args.userContext, args.env.MANAGER_EMAIL_ALLOWLIST)) {
    throw new AuthError("force_refresh requires manager role or allowlist membership");
  }

  const envelope = await performMmrLookup(
    {
      input: {
        kind:    "ymm",
        year:    parsed.data.year,
        make:    parsed.data.make,
        model:   parsed.data.model,
        trim:    parsed.data.trim,
        mileage: parsed.data.mileage,
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
