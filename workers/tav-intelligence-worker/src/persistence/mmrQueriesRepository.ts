import type { SupabaseClient } from "./supabase";
import { PersistenceError } from "../errors";
import type { MmrLookupInput } from "../services/mmrLookup";
import type { UserContext } from "../auth/userContext";
import type { MmrResponseEnvelope } from "../validate";

export type MmrQueryOutcome = "hit" | "miss" | "error";

export interface MmrQueryInsertArgs {
  requestId:    string;
  input:        MmrLookupInput;
  userContext:  UserContext;
  /** Populated envelope on success; null when outcome is "error". */
  envelope:     MmrResponseEnvelope | null;
  cacheHit:     boolean;
  forceRefresh: boolean;
  retryCount:   number;
  latencyMs:    number;
  outcome:      MmrQueryOutcome;
  errorCode?:   string;
  errorMessage?: string;
}

export interface MmrQueriesRepository {
  /**
   * Insert an audit row. Idempotent: a duplicate `requestId` is silently
   * ignored (ON CONFLICT DO NOTHING via the partial unique index on
   * `request_id` added in migration 0030).
   */
  insert(args: MmrQueryInsertArgs): Promise<void>;
}

export function createMmrQueriesRepository(
  client: SupabaseClient,
): MmrQueriesRepository {
  return {
    async insert(args) {
      const row = buildRow(args);
      // ignoreDuplicates: true → upsert with ON CONFLICT DO NOTHING.
      // Supabase returns { data: null, error: null } when the row is skipped,
      // so idempotent retries are transparent to the caller.
      const { error } = await client
        .from("mmr_queries")
        .upsert(row, { onConflict: "request_id", ignoreDuplicates: true });
      if (error) {
        throw new PersistenceError("mmr_queries insert failed", {
          code:    error.code,
          message: error.message,
        });
      }
    },
  };
}

function buildRow(args: MmrQueryInsertArgs): Record<string, unknown> {
  const { input, envelope, userContext } = args;

  const row: Record<string, unknown> = {
    request_id:            args.requestId,
    lookup_type:           input.kind === "vin" ? "vin" : "year_make_model",
    mileage_used:          envelope?.mileage_used ?? null,
    is_inferred_mileage:   envelope?.is_inferred_mileage ?? false,
    requested_by_user_id:  userContext.userId,
    requested_by_name:     userContext.name,
    requested_by_email:    userContext.email,
    source:                args.cacheHit ? "cache" : "manheim",
    cache_hit:             args.cacheHit,
    force_refresh:         args.forceRefresh,
    mmr_value:             envelope?.mmr_value ?? null,
    mmr_payload:           envelope?.mmr_payload ?? null,
    error_code:            args.errorCode ?? envelope?.error_code ?? null,
    error_message:         args.errorMessage ?? envelope?.error_message ?? null,
    retry_count:           args.retryCount,
    latency_ms:            args.latencyMs,
    outcome:               args.outcome,
  };

  if (input.kind === "vin") {
    row.vin  = input.vin;
    row.year = input.year;
  } else {
    row.year  = input.year;
    row.make  = input.make;
    row.model = input.model;
    row.trim  = input.trim ?? null;
  }

  return row;
}
