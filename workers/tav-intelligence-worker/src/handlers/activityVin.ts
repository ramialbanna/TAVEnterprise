import { okResponse } from "../types/api";
import { AuthError, ValidationError } from "../errors";
import type { HandlerArgs } from "./types";

/**
 * GET /activity/vin/:vin — recent user activity on a VIN. Phase F.1 SCAFFOLD ONLY.
 *
 * Returns an empty `recent_activity` array. Real query lands in Phase G.
 */
export async function handleActivityVin(args: HandlerArgs): Promise<Response> {
  if (args.userContext.email === null) {
    throw new AuthError("Cloudflare Access identity required");
  }

  const vinRaw = args.pathParams?.["vin"];
  if (typeof vinRaw !== "string" || vinRaw.length === 0) {
    throw new ValidationError("Missing :vin path parameter");
  }

  const vin = vinRaw.trim().toUpperCase();
  if (vin.length < 11 || vin.length > 17) {
    throw new ValidationError("VIN must be 11–17 characters", { vin_length: vin.length });
  }

  return okResponse(
    {
      vin,
      recent_activity: [] as unknown[],
      note: "not_implemented",
    },
    args.requestId,
  );
}
