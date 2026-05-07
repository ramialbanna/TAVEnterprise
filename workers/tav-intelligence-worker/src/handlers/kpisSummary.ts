import { okResponse } from "../types/api";
import { AuthError } from "../errors";
import type { HandlerArgs } from "./types";

/**
 * GET /kpis/summary — buyer-of-the-week / unit-of-the-week / week-of-the-week.
 * Phase F.1 SCAFFOLD ONLY.
 */
export async function handleKpisSummary(args: HandlerArgs): Promise<Response> {
  if (args.userContext.email === null) {
    throw new AuthError("Cloudflare Access identity required");
  }

  return okResponse(
    {
      best_buyer: null,
      best_unit:  null,
      best_week:  null,
      note:       "not_implemented",
    },
    args.requestId,
  );
}
