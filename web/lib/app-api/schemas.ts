import { z } from "zod";

/**
 * Zod 4 schemas mirroring the live v1 `/app/*` response shapes from `docs/APP_API.md`
 * (source of truth) and `src/app/routes.ts`.
 *
 * Tolerance policy: the documented fields are validated; unknown additive fields are
 * silently dropped (Zod 4 `z.object()` strips by default — it does not reject extras).
 * "Raw rows passed through verbatim" by the Worker (`byRegion`, `sources`) are kept
 * whole as `z.record(z.string(), z.unknown())` rather than overfitting their columns.
 * `null` + `missingReason` metric/status blocks are preserved as-is.
 */

/** A raw row the Worker passes through verbatim — keep every key, don't overfit. */
export const RawRowSchema = z.record(z.string(), z.unknown());

// ── GET /app/system-status ─────────────────────────────────────────────────────
export const SystemStatusSchema = z.object({
  service: z.string(),
  version: z.string(),
  timestamp: z.string(),
  db: z.union([
    z.object({ ok: z.literal(true) }),
    z.object({ ok: z.literal(false), missingReason: z.string() }), // "db_error"
  ]),
  intelWorker: z.object({
    mode: z.enum(["worker", "direct"]),
    binding: z.boolean(),
    url: z.string().nullable(),
  }),
  sources: z.array(RawRowSchema), // rows of tav.v_source_health; [] when the DB is unavailable
  staleSweep: z.union([
    z.object({
      lastRunAt: z.string(),
      status: z.enum(["ok", "failed"]),
      updated: z.number().nullable(),
    }),
    z.object({ lastRunAt: z.null(), missingReason: z.string() }), // "never_run" | "db_error"
  ]),
});
export type SystemStatus = z.infer<typeof SystemStatusSchema>;

// ── GET /app/kpis ──────────────────────────────────────────────────────────────
export const OutcomesBlockSchema = z.object({
  value: z
    .object({
      totalOutcomes: z.number(),
      avgGrossProfit: z.number().nullable(),
      avgHoldDays: z.number().nullable(),
      lastOutcomeAt: z.string().nullable(),
      byRegion: z.array(RawRowSchema), // rows of tav.v_outcome_summary, verbatim
    })
    .nullable(),
  missingReason: z.string().nullable(),
});
export const LeadsBlockSchema = z.object({
  value: z.object({ total: z.number() }).nullable(),
  missingReason: z.string().nullable(),
});
export const ListingsBlockSchema = z.object({
  value: z.object({ normalizedTotal: z.number() }).nullable(),
  missingReason: z.string().nullable(),
});
export const KpisSchema = z.object({
  generatedAt: z.string(),
  outcomes: OutcomesBlockSchema,
  leads: LeadsBlockSchema,
  listings: ListingsBlockSchema,
});
export type Kpis = z.infer<typeof KpisSchema>;
export type OutcomesBlock = z.infer<typeof OutcomesBlockSchema>;
export type LeadsBlock = z.infer<typeof LeadsBlockSchema>;
export type ListingsBlock = z.infer<typeof ListingsBlockSchema>;

// ── GET /app/import-batches ────────────────────────────────────────────────────
export const ImportBatchSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  weekLabel: z.string().nullable(),
  rowCount: z.number(),
  importedCount: z.number(),
  duplicateCount: z.number(),
  rejectedCount: z.number(),
  status: z.enum(["pending", "importing", "complete", "failed"]),
  notes: z.string().nullable(),
});
export const ImportBatchListSchema = z.array(ImportBatchSchema);
export type ImportBatch = z.infer<typeof ImportBatchSchema>;

// ── GET /app/historical-sales ──────────────────────────────────────────────────
export const HistoricalSaleSchema = z.object({
  id: z.string(),
  vin: z.string().nullable(),
  year: z.number(),
  make: z.string(),
  model: z.string(),
  trim: z.string().nullable(),
  buyer: z.string().nullable(),
  buyerUserId: z.string().nullable(),
  acquisitionDate: z.string().nullable(),
  saleDate: z.string(),
  acquisitionCost: z.number().nullable(),
  salePrice: z.number(),
  transportCost: z.number().nullable(),
  reconCost: z.number().nullable(),
  auctionFees: z.number().nullable(),
  grossProfit: z.number().nullable(),
  sourceFileName: z.string().nullable(),
  uploadBatchId: z.string().nullable(),
  createdAt: z.string(),
});
export const HistoricalSaleListSchema = z.array(HistoricalSaleSchema);
export type HistoricalSale = z.infer<typeof HistoricalSaleSchema>;

// ── POST /app/mmr/vin ──────────────────────────────────────────────────────────
export const MmrVinOkSchema = z.object({
  mmrValue: z.number(),
  confidence: z.enum(["high", "medium", "low"]),
  method: z.enum(["vin", "year_make_model"]).nullable(),
});
export const MmrVinUnavailableSchema = z.object({
  mmrValue: z.null(),
  missingReason: z.string(), // intel_worker_not_configured | no_mmr_value | intel_worker_timeout | intel_worker_rate_limited | intel_worker_unavailable
});
export type MmrVinOk = z.infer<typeof MmrVinOkSchema>;
export type MmrVinUnavailable = z.infer<typeof MmrVinUnavailableSchema>;

// ── GET /app/ingest-runs ───────────────────────────────────────────────────────
// Snake_case fields — the Worker returns tav.source_runs columns verbatim
// (see docs/APP_API.md → IngestRunSummary). Do NOT camel-case these.
export const IngestRunSummarySchema = z.object({
  id: z.string(),
  source: z.string(),
  run_id: z.string(),
  region: z.string(),
  status: z.enum(["running", "completed", "failed", "truncated"]),
  item_count: z.number().nullable(),
  processed: z.number().nullable(),
  rejected: z.number().nullable(),
  created_leads: z.number().nullable(),
  scraped_at: z.string(),
  created_at: z.string(),
  error_message: z.string().nullable(),
});
export const IngestRunSummaryListSchema = z.array(IngestRunSummarySchema);
export type IngestRunSummary = z.infer<typeof IngestRunSummarySchema>;

// ── GET /app/ingest-runs/:id ───────────────────────────────────────────────────
// `run` mirrors IngestRunSummary; grouped diagnostics are camelCase records
// keyed by reason_code / missing_reason / event_type. dead_letters is absent by
// design (no source_run_id in schema — see docs/APP_API.md).
// Phase 4a — per-normalized-listing diagnostics. Snake_case mirrors the Worker.
export const ListingDiagnosticSchema = z.object({
  normalized_listing_id: z.string(),
  title: z.string().nullable(),
  listing_url: z.string().nullable(),
  year: z.number().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  trim: z.string().nullable(),
  price: z.number().nullable(),
  mileage: z.number().nullable(),
  vin: z.string().nullable(),
  valuation_status: z.enum(["hit", "miss"]).nullable(),
  valuation_missing_reason: z.string().nullable(),
  mmr_value: z.number().nullable(),
  lead_id: z.string().nullable(),
  lead_grade: z.string().nullable(),
  lead_final_score: z.number().nullable(),
  lead_score_components: z.unknown().nullable(),
  vehicle_candidate_id: z.string().nullable(),
});
export type ListingDiagnostic = z.infer<typeof ListingDiagnosticSchema>;

export const IngestRunDetailSchema = z.object({
  run: IngestRunSummarySchema,
  rawListingCount: z.number(),
  normalizedListingCount: z.number(),
  filteredOutByReason: z.record(z.string(), z.number()),
  valuationMissByReason: z.record(z.string(), z.number()),
  schemaDriftByType: z.record(z.string(), z.number()),
  createdLeadCount: z.number(),
  createdLeadIds: z.array(z.string()),
  listings: z.array(ListingDiagnosticSchema),
});
export type IngestRunDetail = z.infer<typeof IngestRunDetailSchema>;
