import { okResponse } from "../types/api";
import { AuthError, ValidationError, PersistenceError } from "../errors";
import { getSupabaseClient } from "../persistence/supabase";
import type { HandlerArgs } from "./types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT     = 100;

/**
 * GET /activity/vin/:vin — permanent activity feed for a single VIN.
 *
 * Queries tav.user_activity WHERE vin = :vin AND active_until IS NULL,
 * ordered by created_at DESC. Presence rows are excluded.
 *
 * Query params:
 *   limit  integer 1–100, default 50
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

  const url      = new URL(args.request.url);
  const limitRaw = url.searchParams.get("limit");
  const limit    = limitRaw !== null
    ? Math.min(Math.max(parseInt(limitRaw, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const db = getSupabaseClient(args.env);

  const { data, error } = await db
    .from("user_activity")
    .select("*")
    .eq("vin", vin)
    .is("active_until", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new PersistenceError("user_activity vin query failed", {
      code:    error.code,
      message: error.message,
    });
  }

  return okResponse(
    { vin, entries: data ?? [], count: (data ?? []).length, limit },
    args.requestId,
  );
}
