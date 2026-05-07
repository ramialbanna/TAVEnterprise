import { z } from "zod";
import { REGION_KEYS } from "./domain";

// ── Shared enums ──────────────────────────────────────────────────────────────
//
// These mirror the CHECK constraints in migrations 0024–0029. Keep this file
// in sync with the SQL — any divergence becomes a runtime insert error.

export const MMR_LOOKUP_TYPES = ["vin", "year_make_model"] as const;
export const MMR_QUERY_SOURCES = ["manheim", "cache", "manual"] as const;
export const MMR_CACHE_SOURCES = ["manheim", "manual"] as const;
export const ACTIVITY_TYPES = [
  "mmr_search",
  "vin_view",
  "sales_upload",
  "kpi_view",
  "batch_view",
] as const;
export const UPLOAD_STATUSES = ["pending", "validating", "complete", "failed"] as const;

export const MmrLookupTypeSchema = z.enum(MMR_LOOKUP_TYPES);
export const MmrQuerySourceSchema = z.enum(MMR_QUERY_SOURCES);
export const MmrCacheSourceSchema = z.enum(MMR_CACHE_SOURCES);
export const ActivityTypeSchema = z.enum(ACTIVITY_TYPES);
export const UploadStatusSchema = z.enum(UPLOAD_STATUSES);

// ── Common building blocks ────────────────────────────────────────────────────

const RequesterIdentityShape = {
  requested_by_user_id: z.string().max(200).optional(),
  requested_by_name:    z.string().max(200).optional(),
  requested_by_email:   z.string().email().max(255).optional(),
};

const UploaderIdentityShape = {
  uploaded_by_user_id: z.string().max(200).optional(),
  uploaded_by_name:    z.string().max(200).optional(),
  uploaded_by_email:   z.string().email().max(255).optional(),
};

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ── 1. MMR VIN lookup request ─────────────────────────────────────────────────
// POST /mmr/vin

export const MmrVinLookupRequestSchema = z.object({
  vin:           z.string().min(11).max(17),
  mileage:       z.number().int().nonnegative().max(2_000_000).optional(),
  force_refresh: z.boolean().optional().default(false),
  ...RequesterIdentityShape,
});

// ── 2. MMR Year/Make/Model lookup request ─────────────────────────────────────
// POST /mmr/year-make-model

export const MmrYearMakeModelLookupRequestSchema = z.object({
  year:          z.number().int().min(1900).max(2100),
  make:          z.string().min(1).max(64),
  model:         z.string().min(1).max(128),
  trim:          z.string().max(128).optional(),
  mileage:       z.number().int().nonnegative().max(2_000_000).optional(),
  force_refresh: z.boolean().optional().default(false),
  ...RequesterIdentityShape,
});

// ── 3. MMR response envelope ──────────────────────────────────────────────────
// Returned by both lookup endpoints and consumed by the Buy-Box scoring path.

export const MmrResponseEnvelopeSchema = z.object({
  ok:                  z.boolean(),
  mmr_value:           z.number().nullable(),       // null = no result (negative cache)
  mileage_used:        z.number().int().nonnegative(),
  is_inferred_mileage: z.boolean(),
  cache_hit:           z.boolean(),
  source:              MmrQuerySourceSchema,
  fetched_at:          z.string().datetime(),
  expires_at:          z.string().datetime().nullable(),
  mmr_payload:         z.record(z.unknown()).optional(),
  error_code:          z.string().nullable(),
  error_message:       z.string().nullable(),
});

// ── 4. Sales CSV row ──────────────────────────────────────────────────────────
// One row of the parsed weekly sales CSV. Mirrors tav.historical_sales columns
// (excluding the GENERATED gross_profit and FK upload_batch_id, which the
// upload handler injects). passthrough() keeps unknown columns for raw audit.

export const SalesCsvRowSchema = z.object({
  vin:               z.string().min(11).max(17).optional(),
  year:              z.number().int().min(1900).max(2100),
  make:              z.string().min(1).max(64),
  model:             z.string().min(1).max(128),
  trim:              z.string().max(128).optional(),
  buyer:             z.string().max(200).optional(),
  buyer_user_id:     z.string().max(200).optional(),
  acquisition_date:  z.string().regex(ISO_DATE_REGEX, "acquisition_date must be YYYY-MM-DD").optional(),
  sale_date:         z.string().regex(ISO_DATE_REGEX, "sale_date must be YYYY-MM-DD"),
  acquisition_cost:  z.number().nonnegative().max(10_000_000).optional(),
  sale_price:        z.number().positive().max(10_000_000),
  transport_cost:    z.number().nonnegative().max(1_000_000).optional(),
  recon_cost:        z.number().nonnegative().max(1_000_000).optional(),
  auction_fees:      z.number().nonnegative().max(1_000_000).optional(),
  source_file_name:  z.string().max(255).optional(),
}).passthrough();

// ── 5. Sales upload batch request ─────────────────────────────────────────────
// POST /sales/upload

export const SalesUploadBatchRequestSchema = z.object({
  file_name:    z.string().min(1).max(255),
  uploaded_at:  z.string().datetime(),
  rows:         z.array(SalesCsvRowSchema).min(1).max(10_000),
  ...UploaderIdentityShape,
});

// ── 6. Market velocity output ─────────────────────────────────────────────────
// Mirrors tav.market_velocities row. Produced by the velocity recompute job;
// consumed by the hybrid Buy-Box scorer.

export const MarketVelocitySchema = z.object({
  segment_key:           z.string().min(1).max(255),
  year:                  z.number().int().min(1900).max(2100).nullable(),
  make:                  z.string().min(1).max(64),
  model:                 z.string().min(1).max(128),
  trim:                  z.string().max(128).nullable(),
  region:                z.enum(REGION_KEYS).nullable(),
  sales_count_7d:        z.number().int().nonnegative(),
  sales_count_30d:       z.number().int().nonnegative(),
  sales_count_90d:       z.number().int().nonnegative(),
  avg_gross_profit_30d:  z.number().nullable(),
  avg_turn_time_30d:     z.number().nonnegative().nullable(),
  velocity_score:        z.number().nonnegative(),
  time_decay_multiplier: z.number().nonnegative(),
  calculated_at:         z.string().datetime(),
  components:            z.record(z.unknown()),
});

// ── 7. User activity event ────────────────────────────────────────────────────
// Mirrors tav.user_activity row. Written by the intelligence Worker on each
// user action; surfaced in the portal's "who's looking at this VIN" feed.

export const UserActivityEventSchema = z.object({
  user_id:           z.string().max(200).optional(),
  user_name:         z.string().max(200).optional(),
  user_email:        z.string().email().max(255).optional(),
  vin:               z.string().min(11).max(17).optional(),
  year:              z.number().int().min(1900).max(2100).optional(),
  make:              z.string().min(1).max(64).optional(),
  model:             z.string().min(1).max(128).optional(),
  activity_type:     ActivityTypeSchema,
  activity_payload:  z.record(z.unknown()),
  active_until:      z.string().datetime().optional(),
});

// ── Inferred TypeScript types ─────────────────────────────────────────────────

export type MmrLookupType = z.infer<typeof MmrLookupTypeSchema>;
export type MmrQuerySource = z.infer<typeof MmrQuerySourceSchema>;
export type MmrCacheSource = z.infer<typeof MmrCacheSourceSchema>;
export type ActivityType = z.infer<typeof ActivityTypeSchema>;
export type UploadStatus = z.infer<typeof UploadStatusSchema>;

export type MmrVinLookupRequest = z.infer<typeof MmrVinLookupRequestSchema>;
export type MmrYearMakeModelLookupRequest = z.infer<typeof MmrYearMakeModelLookupRequestSchema>;
export type MmrResponseEnvelope = z.infer<typeof MmrResponseEnvelopeSchema>;
export type SalesCsvRow = z.infer<typeof SalesCsvRowSchema>;
export type SalesUploadBatchRequest = z.infer<typeof SalesUploadBatchRequestSchema>;
export type MarketVelocity = z.infer<typeof MarketVelocitySchema>;
export type UserActivityEvent = z.infer<typeof UserActivityEventSchema>;
