import { okResponse } from "../types/api";
import { AuthError, ValidationError, PersistenceError } from "../errors";
import { getSupabaseClient } from "../persistence/supabase";
import { ACTIVITY_TYPES } from "../validate";
import type { ActivityType } from "../validate";
import type { HandlerArgs } from "./types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT     = 100;

/**
 * GET /activity/feed — global permanent activity feed.
 *
 * Returns rows from tav.user_activity where active_until IS NULL, ordered by
 * created_at DESC. Presence rows (active_until IS NOT NULL) are excluded —
 * they are ephemeral and belong to the presence UX, not the activity timeline.
 *
 * Query params:
 *   limit         integer 1–100, default 50
 *   vin           filter to a single VIN (optional)
 *   user_id       filter to a single user (optional)
 *   activity_type one of the ACTIVITY_TYPES enum values (optional)
 */
export async function handleActivityFeed(args: HandlerArgs): Promise<Response> {
  if (args.userContext.email === null) {
    throw new AuthError("Cloudflare Access identity required");
  }

  const url    = new URL(args.request.url);
  const params = url.searchParams;

  const limitRaw = params.get("limit");
  const limit    = limitRaw !== null
    ? Math.min(Math.max(parseInt(limitRaw, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const vin          = params.get("vin")           ?? undefined;
  const userId       = params.get("user_id")       ?? undefined;
  const activityType = params.get("activity_type") ?? undefined;

  if (activityType !== undefined && !(ACTIVITY_TYPES as readonly string[]).includes(activityType)) {
    throw new ValidationError("Invalid activity_type", {
      allowed: ACTIVITY_TYPES,
      received: activityType,
    });
  }

  const db = getSupabaseClient(args.env);

  let query = db
    .from("user_activity")
    .select("*")
    .is("active_until", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (vin)          query = query.eq("vin", vin.trim().toUpperCase());
  if (userId)       query = query.eq("user_id", userId);
  if (activityType) query = query.eq("activity_type", activityType as ActivityType);

  const { data, error } = await query;

  if (error) {
    throw new PersistenceError("user_activity feed query failed", {
      code:    error.code,
      message: error.message,
    });
  }

  return okResponse(
    { entries: data ?? [], count: (data ?? []).length, limit },
    args.requestId,
  );
}
