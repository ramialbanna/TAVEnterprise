// =============================================================================
// domain.ts — TAV-AIP four-concept pipeline types
//
// The four concepts are NEVER conflated (CLAUDE.md §2):
//   1. RawListingPayload    — untouched inbound payload (audit, replay)
//   2. NormalizedListingInput — cleaned per-platform record (pipeline input)
//   3. VehicleCandidateKey  — real-world vehicle identity (fuzzy grouping)
//   4. ScoredLead / Lead    — buyer-facing work item
// =============================================================================

// ── Source enumeration ────────────────────────────────────────────────────────

export type SourceName =
  | "facebook"
  | "craigslist"
  | "autotrader"
  | "cars_com"
  | "offerup";

// ── Concept 1: Raw Listing ────────────────────────────────────────────────────
// The untouched inbound payload from Apify. Stored as-is for audit and replay.
// rawItem is intentionally unknown — no shape assumptions on external payloads.

export interface RawListingPayload {
  source: SourceName;
  sourceRunId?: string;
  rawItem: unknown;
  receivedAt: string;
}

// ── Region keys ───────────────────────────────────────────────────────────────
// Closed set — add new regions here only via an ADR.

export const REGION_KEYS = [
  "dallas_tx",
  "houston_tx",
  "austin_tx",
  "san_antonio_tx",
] as const;
export type RegionKey = (typeof REGION_KEYS)[number];

// ── Concept 2: Normalized Listing ─────────────────────────────────────────────
// Produced exclusively by src/sources/<platform>.ts.
// VIN is ALWAYS optional — Facebook does not expose it. This is not a gap.

export interface NormalizedListingInput {
  source: SourceName;
  sourceRunId?: string;
  sourceListingId?: string;
  url: string;
  title: string;
  vin?: string; // optional everywhere — never required
  year?: number; // integer, validated 1990–2035 by the adapter
  make?: string; // lowercase normalized, e.g. "toyota"
  model?: string; // lowercase normalized, e.g. "camry"
  trim?: string; // lowercase normalized if present, e.g. "se"
  price?: number; // integer dollars — adapters parse "$13,500" → 13500
  mileage?: number; // integer miles — adapters parse "82k" → 82000
  city?: string;
  state?: string; // 2-letter uppercase code, e.g. "TX"
  region?: RegionKey; // TAV region key — validated against REGION_KEYS
  sellerName?: string;
  sellerUrl?: string;
  images?: string[];
  postedAt?: string; // ISO string if the source provides it
  scrapedAt: string; // ISO string set by Apify / adapter
}

export type FreshnessStatus =
  | "new"
  | "active"
  | "aging"
  | "stale_suspected"
  | "stale_confirmed"
  | "removed";

// ── Concept 3: Vehicle Candidate ──────────────────────────────────────────────
// The real-world vehicle behind one or more normalized listings.
// Fuzzy duplicates GROUP here — they are never permanently merged.

export interface VehicleCandidateKey {
  // Format: "year|make|model|trim|mileage_bucket_floor|region"
  // city, state, sellerUrl, image hash are confidence signals only — not in key
  identityKey: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  region?: string;
}

export type DedupeResult =
  | { type: "exact_duplicate"; normalizedListingId: string }
  | { type: "fuzzy_group"; vehicleCandidateId: string; confidence: number }
  | { type: "new_listing" };

export type ValuationConfidence = "high" | "medium" | "low" | "none";

// ── Concept 4: Lead ───────────────────────────────────────────────────────────
// The buyer-facing work item. Created only after scoring, stale-check, and
// dedupe-check all pass. Never created from stale_confirmed listings.

export type LeadStatus =
  | "new"
  | "assigned"
  | "claimed"
  | "contacted"
  | "negotiating"
  | "passed"
  | "duplicate"
  | "stale"
  | "sold"
  | "purchased"
  | "archived";

export type LeadGrade = "excellent" | "good" | "fair" | "pass";

export interface ScoredLead {
  dealScore: number; // 0–100, price vs MMR component (35% weight)
  buyBoxScore: number; // 0–100, buy-box rule match (25% weight)
  freshnessScore: number; // 0–100, derived from stale score (20% weight)
  regionScore: number; // 0–100, buyer region match (10% weight)
  sourceConfidenceScore: number; // 0–100, VIN present / structured data (10% weight)
  finalScore: number; // 0–100, weighted composite
  grade: LeadGrade; // 85–100 excellent · 70–84 good · 55–69 fair · 0–54 pass
  reasonCodes: string[]; // populated from src/scoring/reasonCodes.ts constants
  matchedRuleId?: string;
  matchedRuleVersion?: number;
  valuationConfidence?: ValuationConfidence;
}

// ── Buy-box rule (mirrors tav.buy_box_rules) ──────────────────────────────────

export interface BuyBoxRule {
  id: string;
  ruleId: string;
  version: number;
  make: string | null;        // comma-separated makes, or null = any
  model: string | null;
  yearMin: number | null;
  yearMax: number | null;
  maxMileage: number | null;
  minMileage: number | null;
  targetPricePctOfMmr: number | null;
  regions: string[] | null;
  sources: string[] | null;
  priorityScore: number | null;
  isActive: boolean;
}

export interface BuyBoxMatch {
  ruleId: string;
  ruleVersion: number;
  ruleDbId: string;
  score: number; // 0–100
}

// ── Normalized listing upsert result ─────────────────────────────────────────

export interface NormalizedListingUpsertResult {
  id: string;
  isNew: boolean;
  priceChanged: boolean;
  mileageChanged: boolean;
}

// ── Source adapter result contract ────────────────────────────────────────────
// Every src/sources/<platform>.ts returns this type. The discriminated union
// forces callers to handle both success and failure explicitly.

export type AdapterResult =
  | { ok: true; listing: NormalizedListingInput }
  | { ok: false; reason: string; details?: unknown };
