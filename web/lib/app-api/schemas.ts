import { z } from "zod";

/**
 * Zod 4 schemas mirroring the live v1 `/app/*` response shapes from `docs/03-api/app-api.md`
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
  maxbuy: z
    .object({
      enabled: z.boolean(),
      binding: z.boolean(),
      url: z.string().nullable(),
    })
    .optional(),
});
export type SystemStatus = z.infer<typeof SystemStatusSchema>;

// ── POST /app/maxbuy/evaluate ──────────────────────────────────────────────────
export const MaxbuyEvaluateOkSchema = z.object({
  contract_version: z.string(),
  recommendation_id: z.string().uuid(),
  vehicle: z.object({
    vin: z.string().nullable(),
    year: z.number().nullable(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    trim: z.string().nullable(),
    mileage: z.number(),
    mileage_estimated: z.boolean(),
  }),
  mmr: z.object({
    value: z.number().nullable(),
    method: z.enum(["vin", "ymm"]).nullable(),
    source: z.string().nullable(),
    cache_age_seconds: z.number().nullable(),
    missing_reason: z.string().nullable(),
    observed_at: z.string().nullable(),
  }),
  tav_historical: z.object({
    n_units: z.number(),
    avg_buy: z.number().nullable(),
    avg_sale: z.number().nullable(),
    avg_gross: z.number().nullable(),
    avg_recon: z.number().nullable(),
    avg_days_to_sale: z.number().nullable(),
    outcome_distribution: z.record(z.string(), z.number()),
  }),
  economics: z.object({
    expected_sale_price: z.number(),
    expected_transport: z.number(),
    expected_expenses: z.number(),
    expected_net_gross: z.number().nullable(),
  }),
  verdict: z.object({
    display_state: z.enum(["deal_fit", "vehicle_fit"]),
    verdict: z.enum(["STRONG_BUY", "BUY", "REVIEW", "PASS"]).nullable(),
    recommended_max_buy: z.number(),
    delta_to_ask: z.number().nullable(),
    data_strength: z.enum(["low", "medium", "high"]),
    reason_codes: z.array(z.string()),
    estimated_badges: z.array(z.string()),
    hard_gate_triggered: z.string().nullable(),
  }),
  versions: z.object({
    benchmark_version: z.string(),
    feature_view_version: z.string(),
    policy_version: z.string(),
    scoring_version: z.string(),
    model_artifact_hash: z.null(),
  }),
});
export type MaxbuyEvaluateOk = z.infer<typeof MaxbuyEvaluateOkSchema>;

// ── POST /app/maxbuy/overrides · passes ────────────────────────────────────────
export const MaxbuyOverrideOkSchema = z.object({
  override_id: z.string().uuid(),
});
export type MaxbuyOverrideOk = z.infer<typeof MaxbuyOverrideOkSchema>;

export const MaxbuyPassOkSchema = z.object({
  pass_id: z.string().uuid(),
});
export type MaxbuyPassOk = z.infer<typeof MaxbuyPassOkSchema>;

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

// ── POST /app/mmr/vin — Phase 4 market context (Cox historical/forecast/transactions) ──

export const MmrHistoricalSlotSchema = z.object({
  price: z.number().nullable(),
  avgMileage: z.number().nullable(),
});

export const MmrHistoricalAveragesSchema = z.object({
  past30Days: MmrHistoricalSlotSchema.nullable(),
  sixMonthsAgo: MmrHistoricalSlotSchema.nullable(),
  lastYear: MmrHistoricalSlotSchema.nullable(),
});

export const MmrProjectedAverageSchema = z.object({
  price: z.number().nullable(),
  avgMileage: z.number().nullable(),
});

export const MmrTransactionSchema = z.object({
  date: z.string().nullable(),
  price: z.number().nullable(),
  odometer: z.number().nullable(),
  grade: z.string().nullable(),
  evbh: z.number().nullable(),
  engineTrans: z.string().nullable(),
  exteriorColor: z.string().nullable(),
  type: z.string().nullable(),
  region: z.string().nullable(),
  auction: z.string().nullable(),
});

export const MmrVinOkSchema = z.object({
  mmrValue: z.number(),
  confidence: z.enum(["high", "medium", "low"]),
  method: z.enum(["vin", "year_make_model"]).nullable(),
  year: z.number().nullable().optional(),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  trim: z.string().nullable().optional(),
  mileageUsed: z.number().nullable().optional(),
  avgOdometer: z.number().nullable().optional(),
  avgCondition: z.number().nullable().optional(),
  sampleCount: z.number().nullable().optional(),
  rangeLow: z.number().nullable().optional(),
  rangeHigh: z.number().nullable().optional(),
  adjustedMmr: z.number().nullable().optional(),
  buildOptionsIncluded: z.boolean().optional(),
  buildOptionsAdjustment: z.number().nullable().optional(),
  odometerAdjustment: z.number().nullable().optional(),
  gradeAdjustment: z.number().nullable().optional(),
  colorAdjustment: z.number().nullable().optional(),
  regionAdjustment: z.number().nullable().optional(),
  retailValue: z.number().nullable().optional(),
  retailRangeLow: z.number().nullable().optional(),
  retailRangeHigh: z.number().nullable().optional(),
  avgEvBatteryScore: z.number().nullable().optional(),
  historicalAverages: MmrHistoricalAveragesSchema.optional(),
  projectedAverage: MmrProjectedAverageSchema.optional(),
  transactions: z.array(MmrTransactionSchema).optional(),
});
export const MmrVinUnavailableSchema = z.object({
  mmrValue: z.null(),
  missingReason: z.string(), // intel_worker_not_configured | no_mmr_value | intel_worker_timeout | intel_worker_rate_limited | intel_worker_unavailable
});
export type MmrVinOk = z.infer<typeof MmrVinOkSchema>;
export type MmrVinUnavailable = z.infer<typeof MmrVinUnavailableSchema>;

export const MmrCatalogSchema = z.object({
  items: z.array(z.string()),
  catalogState: z.enum(["connected", "not_connected"]),
  cached: z.boolean(),
  reason: z.string().nullable(),
});
export type MmrCatalog = z.infer<typeof MmrCatalogSchema>;

// ── GET /app/ingest-runs ───────────────────────────────────────────────────────
// Snake_case fields — the Worker returns tav.source_runs columns verbatim
// (see docs/03-api/app-api.md → IngestRunSummary). Do NOT camel-case these.
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
// design (no source_run_id in schema — see docs/03-api/app-api.md).
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
  valuation_mileage: z.number().nullable(),
  valuation_mileage_is_estimated: z.boolean().default(false),
  valuation_style: z.string().nullable().default(null),
  valuation_style_is_estimated: z.boolean().default(false),
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
  // Backward-compatible while Worker and Vercel deploy separately: old Worker
  // versions omit the Phase 4a field, so the drawer simply shows an empty table.
  listings: z.array(ListingDiagnosticSchema).default([]),
});
export type IngestRunDetail = z.infer<typeof IngestRunDetailSchema>;

// ── GET /app/opportunities ─────────────────────────────────────────────────────
export const MaxbuySummarySchema = z.object({
  recommendationId: z.string(),
  verdict: z.enum(["STRONG_BUY", "BUY", "REVIEW", "PASS"]),
  recommendedMaxBuy: z.number(),
  dataStrength: z.enum(["low", "medium", "high"]),
  evaluatedAt: z.string(),
});
export type MaxbuySummary = z.infer<typeof MaxbuySummarySchema>;

export const OpportunityEstimateFlagsSchema = z
  .object({
    mileage: z.boolean().default(false),
    style: z.boolean().default(false),
    mmr: z.boolean().default(false),
  })
  .default({ mileage: false, style: false, mmr: false });

export const OpportunityRowSchema = z.object({
  id: z.string(),
  type: z.enum(["lead", "near_miss", "manual_submission"]),
  badges: z.array(z.string()),
  source: z.string(),
  region: z.string().nullable(),
  sourceRunId: z.string().nullable(),
  normalizedListingId: z.string(),
  vehicleCandidateId: z.string().nullable(),
  leadId: z.string().nullable(),
  title: z.string(),
  year: z.number().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  style: z.string().nullable(),
  vin: z.string().nullable(),
  price: z.number().nullable(),
  mmrValue: z.number().nullable(),
  spread: z.number().nullable(),
  finalScore: z.number().nullable(),
  grade: z.string().nullable(),
  status: z.string().nullable(),
  submittedBy: z.string().nullable(),
  assignedTo: z.string().nullable(),
  assignedCloserName: z.string().nullable(),
  claimedBy: z.string().nullable(),
  claimedAt: z.string().nullable(),
  claimExpiresAt: z.string().nullable(),
  lastEvaluatedBy: z.string().nullable(),
  lastEvaluatedAt: z.string().nullable(),
  firstSeenAt: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  seenCount: z.number().nullable(),
  listingUrl: z.string().nullable(),
  entryMethod: z.enum(["manual", "scraper", "import"]).nullable().optional(),
  estimateFlags: OpportunityEstimateFlagsSchema,
  maxbuySummary: MaxbuySummarySchema.nullable().optional(),
  bodyType: z.string().nullable().optional(),
  engine: z.string().nullable().optional(),
  transmission: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  contactFirstName: z.string().nullable().optional(),
  contactLastName: z.string().nullable().optional(),
  contactHomePhone: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  contactAddress: z.string().nullable().optional(),
  contactPostalCode: z.string().nullable().optional(),
  salesperson: z.string().nullable().optional(),
  appraiser: z.string().nullable().optional(),
  titleOwner: z.string().nullable().optional(),
  titleStateRegion: z.string().nullable().optional(),
  lienHolder: z.string().nullable().optional(),
  lienAccountNumber: z.string().nullable().optional(),
  lienPayoff: z.number().nullable().optional(),
  tagOrPlate: z.string().nullable().optional(),
  tagStateRegion: z.string().nullable().optional(),
  tagExpiration: z.string().nullable().optional(),
  certified: z.boolean().optional(),
  extendedWarranty: z.boolean().optional(),
});
export const OpportunityRowListSchema = z.array(OpportunityRowSchema);
export type OpportunityRow = z.infer<typeof OpportunityRowSchema>;

export const OpportunityListPageSchema = z.object({
  items: OpportunityRowListSchema,
  total: z.number(),
  offset: z.number().default(0),
});
export type OpportunityListPage = z.infer<typeof OpportunityListPageSchema>;

export const OpportunityActionTypeSchema = z.enum([
  "submitted",
  "assigned",
  "unassigned",
  "reassigned",
  "claimed",
  "evaluated",
  "status_changed",
  "note_added",
  "fields_updated",
]);
export type OpportunityActionType = z.infer<typeof OpportunityActionTypeSchema>;

export const OpportunityActionSchema = z.object({
  id: z.string(),
  normalizedListingId: z.string(),
  actorUserId: z.string(),
  actorName: z.string().nullable(),
  action: OpportunityActionTypeSchema,
  notes: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type OpportunityAction = z.infer<typeof OpportunityActionSchema>;

/** Values accepted by POST /app/opportunities/:id/status (`bought` maps to `purchased` on the Worker). */
export const MutatableWorkflowStatusSchema = z.enum([
  "reviewed",
  "contacted",
  "negotiating",
  "purchased",
  "bought",
  "passed",
]);
export type MutatableWorkflowStatus = z.infer<typeof MutatableWorkflowStatusSchema>;

export const OpportunityDetailSchema = OpportunityRowSchema.extend({
  reasonCodes: z.array(z.string()),
  valuationMissingReason: z.string().nullable(),
  scoreComponents: z.unknown().nullable(),
  candidateListingCount: z.number().nullable(),
  mileage: z.number().nullable(),
  actions: z.array(OpportunityActionSchema).default([]),
});
export type OpportunityDetail = z.infer<typeof OpportunityDetailSchema>;

/** POST /app/opportunities/parse — prefilled submit fields (Facebook v1). */
export const ParsedListingFieldsSchema = z.object({
  listingUrl: z.string(),
  source: z.enum(["facebook", "craigslist", "autotrader", "cars_com", "offerup"]),
  title: z.string().optional(),
  year: z.number().int().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  style: z.string().optional(),
  price: z.number().int().optional(),
  mileage: z.number().int().optional(),
  vin: z.string().optional(),
  warnings: z.array(z.string()),
});
export type ParsedListingFields = z.infer<typeof ParsedListingFieldsSchema>;

export const ManualSubmissionResultSchema = z.object({
  submissionId: z.string(),
  normalizedListingId: z.string(),
  isDuplicateUrl: z.boolean(),
  warnings: z.array(z.string()),
  opportunity: OpportunityDetailSchema.nullable(),
});
export type ManualSubmissionResult = z.infer<typeof ManualSubmissionResultSchema>;

export const AppUserSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: z.enum(["admin", "closer", "viewer"]),
});
export const AppUserSummaryListSchema = z.array(AppUserSummarySchema);
export type AppUserSummary = z.infer<typeof AppUserSummarySchema>;

export const AppUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: z.enum(["admin", "closer", "viewer"]),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AppUser = z.infer<typeof AppUserSchema>;
