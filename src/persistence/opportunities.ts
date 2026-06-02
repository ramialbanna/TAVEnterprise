import type { SupabaseClient } from "./supabase";
import { buildListingDiagnostics } from "./ingestRuns";
import { computeDealScore } from "../scoring/deal";
import { fetchWorkflowMap, isActiveClaim, listOpportunityActions, type OpportunityActionRecord, type WorkflowDisplayContext } from "./opportunityWorkflow";

/**
 * Read-only persistence for v2 Opportunities (`GET /app/opportunities[/:id]`).
 * Assembles a buyer-facing read model from leads, normalized listings, valuations,
 * and vehicle candidates — no writes, no workflow mutations.
 */

export type OpportunityType = "lead" | "near_miss" | "manual_submission";

export interface OpportunityEstimateFlags {
  mileage: boolean;
  style: boolean;
  mmr: boolean;
}

export interface OpportunityRow {
  id: string;
  type: OpportunityType;
  badges: string[];
  source: string;
  region: string | null;
  sourceRunId: string | null;
  normalizedListingId: string;
  vehicleCandidateId: string | null;
  leadId: string | null;
  title: string;
  year: number | null;
  make: string | null;
  model: string | null;
  style: string | null;
  vin: string | null;
  price: number | null;
  mmrValue: number | null;
  spread: number | null;
  finalScore: number | null;
  grade: string | null;
  status: string | null;
  submittedBy: string | null;
  assignedTo: string | null;
  assignedCloserName: string | null;
  claimedBy: string | null;
  claimedAt: string | null;
  claimExpiresAt: string | null;
  lastEvaluatedBy: string | null;
  lastEvaluatedAt: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  seenCount: number | null;
  listingUrl: string | null;
  estimateFlags: OpportunityEstimateFlags;
}

export interface OpportunityDetail extends OpportunityRow {
  reasonCodes: string[];
  valuationMissingReason: string | null;
  scoreComponents: unknown | null;
  candidateListingCount: number | null;
  mileage: number | null;
  actions: OpportunityActionRecord[];
}

export type OpportunitySort = "spread_desc" | "score_desc" | "last_seen_desc";

export type OpportunityView = "needs_action" | "mine" | "worth_a_look" | "all";

export interface OpportunityListFilter {
  limit: number;
  offset?: number;
  sort?: OpportunitySort;
  view?: OpportunityView;
  /** Required for `view=mine`; used for assignee / active-claim matching. */
  viewerUserId?: string;
  source?: string;
  region?: string;
  type?: OpportunityType;
  grade?: string;
  status?: string;
}

export interface OpportunityListPage {
  items: OpportunityRow[];
  total: number;
  offset: number;
}

/** Minimum spread ($) for `view=worth_a_look`. */
export const WORTH_A_LOOK_MIN_SPREAD = 1_000;

/** Max age (days since last seen) for `view=worth_a_look`. */
export const WORTH_A_LOOK_MAX_STALE_DAYS = 7;

/** Claim window ending within this many ms counts as needs-action. */
export const CLAIM_EXPIRING_SOON_MS = 4 * 60 * 60 * 1000;

const LISTING_COLUMNS =
  "id, source, source_run_id, region, title, year, make, model, trim, vin, price, mileage, listing_url, first_seen_at, last_seen_at, scrape_count, price_changed, mileage_changed, freshness_status";

/** Freshness values that must not appear in the buyer queue (OQ-002). */
const SUPPRESSED_FRESHNESS = new Set(["stale_confirmed", "removed"]);

/**
 * First-pass near-miss gate: MMR-hit listings that did not become leads (pass grade)
 * only surface when a buyer could plausibly act — not stale/removed, incomplete YMM,
 * or clearly overpriced vs MMR.
 */
export function isReviewableNearMiss(input: {
  freshnessStatus: string | null;
  price: number | null;
  mmrValue: number | null;
  year: number | null;
  make: string | null;
  model: string | null;
}): boolean {
  const freshness = input.freshnessStatus ?? "new";
  if (SUPPRESSED_FRESHNESS.has(freshness)) return false;
  if (input.year === null || !input.make?.trim() || !input.model?.trim()) return false;
  if (input.price === null || input.mmrValue === null || input.mmrValue <= 0) return false;
  // Same deal ladder as ingest: pass-grade junk is typically asking above MMR (deal score < 25).
  return computeDealScore(input.price, input.mmrValue) >= 25;
}

const VALUATION_COLUMNS =
  "normalized_listing_id, mmr_value, mileage, missing_reason, vehicle_candidate_id, lookup_trim, normalization_confidence, fetched_at";

const LEAD_COLUMNS =
  "id, normalized_listing_id, vehicle_candidate_id, status, grade, final_score, reason_codes, score_components, mmr_value, assigned_to, assigned_at, lock_expires_at";

type ListingRow = Record<string, unknown>;
type ValuationRow = Record<string, unknown>;
type LeadRow = Record<string, unknown>;

interface ManualSubmissionContext {
  submittedByUserId: string;
  submittedByName: string;
  assignedToUserId: string | null;
  assignedCloserName: string | null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function computeEstimateFlags(
  listingMileage: number | null,
  valuationMileage: number | null,
  styleEstimated: boolean,
): OpportunityEstimateFlags {
  const mileage = listingMileage === null && valuationMileage !== null;
  const style = styleEstimated;
  const mmr = mileage || style;
  return { mileage, style, mmr };
}

/** Build event badges from listing signals, valuation estimates, and lead context. */
export function buildOpportunityBadges(input: {
  scrapeCount: number;
  priceChanged: boolean;
  mileageChanged: boolean;
  mileageUnknown: boolean;
  hasLead: boolean;
  hasMmr: boolean;
  isManualSubmission: boolean;
  estimateFlags: OpportunityEstimateFlags;
  candidateListingCount: number | null;
}): string[] {
  const badges: string[] = [];
  if (input.isManualSubmission) badges.push("Manual submission");
  if (input.scrapeCount <= 1) badges.push("First seen");
  else badges.push(`Seen again #${input.scrapeCount - 1}`);
  if (input.priceChanged) badges.push("Price changed");
  if (input.mileageChanged) badges.push("Mileage changed");
  if (input.mileageUnknown) badges.push("Mileage unknown");
  if (input.estimateFlags.mileage) badges.push("Estimated miles");
  if (input.estimateFlags.style) badges.push("Estimated style");
  if (input.estimateFlags.mmr) badges.push("Estimated MMR");
  if (!input.hasLead && input.hasMmr) badges.push("Near miss");
  if (input.candidateListingCount !== null && input.candidateListingCount > 1) {
    badges.push("Possible duplicate");
  }
  return badges;
}

function resolveOpportunityType(
  hasLead: boolean,
  hasMmr: boolean,
  isManualSubmission: boolean,
): OpportunityType | null {
  if (hasLead) return "lead";
  if (isManualSubmission) return "manual_submission";
  if (hasMmr) return "near_miss";
  return null;
}

function mapToOpportunityRow(
  listing: ListingRow,
  diagnostic: ReturnType<typeof buildListingDiagnostics>[number],
  lead: LeadRow | null,
  candidateListingCount: number | null,
  manual: ManualSubmissionContext | null,
  workflow: WorkflowDisplayContext | null,
): OpportunityRow | null {
  const hasLead = lead !== null;
  const hasMmr = diagnostic.mmr_value !== null;
  const isManualSubmission = manual !== null;
  const type = resolveOpportunityType(hasLead, hasMmr, isManualSubmission);
  if (type === null) return null;

  if (
    type === "near_miss" &&
    !isReviewableNearMiss({
      freshnessStatus: asString(listing.freshness_status),
      price: asNumber(listing.price),
      mmrValue: diagnostic.mmr_value,
      year: asNumber(listing.year),
      make: asString(listing.make),
      model: asString(listing.model),
    })
  ) {
    return null;
  }

  const listingMileage = asNumber(listing.mileage);
  const estimateFlags = computeEstimateFlags(
    listingMileage,
    diagnostic.valuation_mileage,
    diagnostic.valuation_style_is_estimated,
  );
  const scrapeCount = asNumber(listing.scrape_count) ?? 1;
  const price = asNumber(listing.price);
  const mmrValue = diagnostic.mmr_value;
  const spread =
    mmrValue !== null && price !== null ? mmrValue - price : null;

  const badges = buildOpportunityBadges({
    scrapeCount,
    priceChanged: listing.price_changed === true,
    mileageChanged: listing.mileage_changed === true,
    mileageUnknown: listingMileage === null,
    hasLead,
    hasMmr,
    isManualSubmission,
    estimateFlags,
    candidateListingCount,
  });

  const assignedTo =
    workflow?.assignedToUserId ?? manual?.assignedToUserId ?? (lead ? asString(lead.assigned_to) : null);
  const assignedCloserName =
    workflow?.assignedCloserName ?? manual?.assignedCloserName ?? null;

  const claimedBy =
    workflow && isActiveClaim(workflow)
      ? workflow.claimedByUserId
      : workflow?.claimedByUserId ??
        (workflow === null && lead ? asString(lead.assigned_to) : null);
  const claimedByName =
    workflow && isActiveClaim(workflow) ? workflow.claimedByName : null;
  const claimedAt =
    workflow && isActiveClaim(workflow)
      ? workflow.claimedAt
      : workflow?.claimedAt ?? (workflow === null && lead ? asString(lead.assigned_at) : null);
  const claimExpiresAt =
    workflow && isActiveClaim(workflow)
      ? workflow.claimExpiresAt
      : workflow?.claimExpiresAt ??
        (workflow === null && lead ? asString(lead.lock_expires_at) : null);

  const workflowStatus = workflow?.status ?? null;
  const leadStatus = lead ? asString(lead.status) : null;
  const status = workflowStatus ?? leadStatus ?? (manual ? "new" : null);

  return {
    id: listing.id as string,
    type,
    badges,
    source: listing.source as string,
    region: asString(listing.region),
    sourceRunId: asString(listing.source_run_id),
    normalizedListingId: listing.id as string,
    vehicleCandidateId: diagnostic.vehicle_candidate_id,
    leadId: lead ? (lead.id as string) : null,
    title: (listing.title as string) ?? "",
    year: asNumber(listing.year),
    make: asString(listing.make),
    model: asString(listing.model),
    style: asString(listing.trim),
    vin: asString(listing.vin),
    price,
    mmrValue,
    spread,
    finalScore: lead ? asNumber(lead.final_score) : diagnostic.lead_final_score,
    grade: lead ? asString(lead.grade) : diagnostic.lead_grade,
    status,
    submittedBy: manual?.submittedByName ?? null,
    assignedTo,
    assignedCloserName,
    claimedBy: claimedByName ?? claimedBy,
    claimedAt,
    claimExpiresAt,
    lastEvaluatedBy: workflow?.lastEvaluatedByName ?? workflow?.lastEvaluatedByUserId ?? null,
    lastEvaluatedAt: workflow?.lastEvaluatedAt ?? null,
    firstSeenAt: asString(listing.first_seen_at),
    lastSeenAt: asString(listing.last_seen_at),
    seenCount: scrapeCount,
    listingUrl: asString(listing.listing_url),
    estimateFlags,
  };
}

function mapToOpportunityDetail(
  row: OpportunityRow,
  listing: ListingRow,
  diagnostic: ReturnType<typeof buildListingDiagnostics>[number],
  lead: LeadRow | null,
  candidateListingCount: number | null,
  actions: OpportunityActionRecord[],
): OpportunityDetail {
  const reasonCodes = lead?.reason_codes;
  return {
    ...row,
    reasonCodes: Array.isArray(reasonCodes) ? (reasonCodes as string[]) : [],
    valuationMissingReason: diagnostic.valuation_missing_reason,
    scoreComponents: lead?.score_components ?? diagnostic.lead_score_components ?? null,
    candidateListingCount,
    mileage: asNumber(listing.mileage),
    actions,
  };
}

function applyListFilter(rows: OpportunityRow[], filter: OpportunityListFilter): OpportunityRow[] {
  let out = rows;
  if (filter.type) out = out.filter((r) => r.type === filter.type);
  if (filter.grade) out = out.filter((r) => r.grade === filter.grade);
  if (filter.status) out = out.filter((r) => r.status === filter.status);
  return out;
}

export function matchesNeedsAction(
  row: OpportunityRow,
  workflow: WorkflowDisplayContext | null,
  now: Date = new Date(),
): boolean {
  if (!row.assignedTo) return true;
  if (row.type === "manual_submission" && (row.status === "new" || row.status === null)) {
    return true;
  }
  if (workflow && isActiveClaim(workflow) && workflow.claimExpiresAt) {
    const msLeft = new Date(workflow.claimExpiresAt).getTime() - now.getTime();
    if (msLeft > 0 && msLeft <= CLAIM_EXPIRING_SOON_MS) return true;
  }
  return false;
}

export function matchesMine(
  row: OpportunityRow,
  workflow: WorkflowDisplayContext | null,
  viewerUserId: string,
): boolean {
  if (row.assignedTo === viewerUserId) return true;
  if (workflow && isActiveClaim(workflow) && workflow.claimedByUserId === viewerUserId) {
    return true;
  }
  return false;
}

export function matchesWorthALook(row: OpportunityRow, now: Date = new Date()): boolean {
  if (row.spread === null || row.spread < WORTH_A_LOOK_MIN_SPREAD) return false;
  if (row.mmrValue === null || row.mmrValue <= 0) return false;
  if (row.lastSeenAt) {
    const ageDays = (now.getTime() - new Date(row.lastSeenAt).getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays > WORTH_A_LOOK_MAX_STALE_DAYS) return false;
  }
  return true;
}

export function sortOpportunityRows(
  rows: OpportunityRow[],
  sort: OpportunitySort = "last_seen_desc",
): void {
  rows.sort((a, b) => {
    switch (sort) {
      case "spread_desc": {
        const diff = (b.spread ?? Number.NEGATIVE_INFINITY) - (a.spread ?? Number.NEGATIVE_INFINITY);
        return diff !== 0 ? diff : (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "");
      }
      case "score_desc": {
        const diff =
          (b.finalScore ?? Number.NEGATIVE_INFINITY) - (a.finalScore ?? Number.NEGATIVE_INFINITY);
        return diff !== 0 ? diff : (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "");
      }
      case "last_seen_desc":
      default:
        return (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "");
    }
  });
}

function applyViewFilter(
  rows: OpportunityRow[],
  filter: OpportunityListFilter,
  workflowByListing: Map<string, WorkflowDisplayContext>,
): OpportunityRow[] {
  const view = filter.view ?? "all";
  if (view === "all") return rows;

  const now = new Date();
  return rows.filter((row) => {
    const workflow = workflowByListing.get(row.id) ?? null;
    switch (view) {
      case "needs_action":
        return matchesNeedsAction(row, workflow, now);
      case "mine":
        return filter.viewerUserId
          ? matchesMine(row, workflow, filter.viewerUserId)
          : false;
      case "worth_a_look":
        return matchesWorthALook(row, now);
      default:
        return true;
    }
  });
}

export function paginateOpportunityRows(
  rows: OpportunityRow[],
  offset: number,
  limit: number,
): OpportunityListPage {
  const safeOffset = Math.max(offset, 0);
  return {
    items: rows.slice(safeOffset, safeOffset + limit),
    total: rows.length,
    offset: safeOffset,
  };
}

async function fetchCandidateCounts(
  db: SupabaseClient,
  candidateIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (candidateIds.length === 0) return out;

  const { data, error } = await db
    .from("vehicle_candidates")
    .select("id, listing_count")
    .in("id", candidateIds);
  if (error) throw error;

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const id = row.id as string;
    out.set(id, asNumber(row.listing_count) ?? 1);
  }
  return out;
}

async function loadOpportunityContext(
  db: SupabaseClient,
  listingIds: string[],
): Promise<{
  valuations: ValuationRow[];
  leads: LeadRow[];
}> {
  if (listingIds.length === 0) {
    return { valuations: [], leads: [] };
  }

  const [{ data: valData, error: valErr }, { data: leadData, error: leadErr }] =
    await Promise.all([
      db.from("valuation_snapshots").select(VALUATION_COLUMNS).in("normalized_listing_id", listingIds),
      db.from("leads").select(LEAD_COLUMNS).in("normalized_listing_id", listingIds),
    ]);

  if (valErr) throw valErr;
  if (leadErr) throw leadErr;

  return {
    valuations: (valData ?? []) as ValuationRow[],
    leads: (leadData ?? []) as LeadRow[],
  };
}

async function fetchManualSubmissionContext(
  db: SupabaseClient,
  listingIds: string[],
): Promise<Map<string, ManualSubmissionContext>> {
  const out = new Map<string, ManualSubmissionContext>();
  if (listingIds.length === 0) return out;

  const { data: submissionRows, error: submissionErr } = await db
    .from("manual_opportunity_submissions")
    .select("normalized_listing_id, submitted_by_user_id, assigned_to_user_id, created_at")
    .in("normalized_listing_id", listingIds)
    .order("created_at", { ascending: false });

  if (submissionErr) throw submissionErr;

  const latestByListing = new Map<string, Record<string, unknown>>();
  for (const row of (submissionRows ?? []) as Array<Record<string, unknown>>) {
    const listingId = row.normalized_listing_id as string;
    if (!latestByListing.has(listingId)) latestByListing.set(listingId, row);
  }

  if (latestByListing.size === 0) return out;

  const userIds = new Set<string>();
  for (const row of latestByListing.values()) {
    userIds.add(row.submitted_by_user_id as string);
    const assigneeId = row.assigned_to_user_id as string | null;
    if (assigneeId) userIds.add(assigneeId);
  }

  const { data: userRows, error: userErr } = await db
    .from("users")
    .select("id, display_name")
    .in("id", [...userIds]);
  if (userErr) throw userErr;

  const userNames = new Map<string, string>();
  for (const row of (userRows ?? []) as Array<Record<string, unknown>>) {
    userNames.set(row.id as string, row.display_name as string);
  }

  for (const [listingId, row] of latestByListing) {
    const submitterId = row.submitted_by_user_id as string;
    const assigneeId = row.assigned_to_user_id as string | null;
    out.set(listingId, {
      submittedByUserId: submitterId,
      submittedByName: userNames.get(submitterId) ?? submitterId,
      assignedToUserId: assigneeId,
      assignedCloserName: assigneeId ? (userNames.get(assigneeId) ?? assigneeId) : null,
    });
  }

  return out;
}

async function fetchRecentManualListingIds(
  db: SupabaseClient,
  filter: OpportunityListFilter,
  limit: number,
): Promise<string[]> {
  const { data, error } = await db
    .from("manual_opportunity_submissions")
    .select("normalized_listing_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row) => (row as Record<string, unknown>).normalized_listing_id as string);
}

async function fetchListingsByIds(
  db: SupabaseClient,
  listingIds: string[],
  filter: OpportunityListFilter,
): Promise<ListingRow[]> {
  if (listingIds.length === 0) return [];

  let q = db.from("normalized_listings").select(LISTING_COLUMNS).in("id", listingIds);
  if (filter.source) q = q.eq("source", filter.source);
  if (filter.region) q = q.eq("region", filter.region);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ListingRow[];
}

function assembleRows(
  listings: ListingRow[],
  valuations: ValuationRow[],
  leads: LeadRow[],
  candidateCounts: Map<string, number>,
  manualByListing: Map<string, ManualSubmissionContext>,
  workflowByListing: Map<string, WorkflowDisplayContext>,
): OpportunityRow[] {
  const diagnostics = buildListingDiagnostics(listings, valuations, leads);
  const leadByListing = new Map<string, LeadRow>();
  for (const l of leads) {
    const nlId = l.normalized_listing_id as string;
    leadByListing.set(nlId, l);
  }

  const rows: OpportunityRow[] = [];
  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i]!;
    const nlId = listing.id as string;
    const lead = leadByListing.get(nlId) ?? null;
    const diagnostic = diagnostics[i]!;
    const candidateId = diagnostic.vehicle_candidate_id;
    const candidateListingCount =
      candidateId !== null ? (candidateCounts.get(candidateId) ?? null) : null;
    const manual = manualByListing.get(nlId) ?? null;
    const workflow = workflowByListing.get(nlId) ?? null;
    const row = mapToOpportunityRow(
      listing,
      diagnostic,
      lead,
      candidateListingCount,
      manual,
      workflow,
    );
    if (row) rows.push(row);
  }

  return rows;
}

export async function listOpportunities(
  db: SupabaseClient,
  filter: OpportunityListFilter,
): Promise<OpportunityListPage> {
  const offset = filter.offset ?? 0;
  const usesView = filter.view !== undefined && filter.view !== "all";
  const fetchLimit = usesView ? MAX_FETCH : Math.min(filter.limit * 5, MAX_FETCH);
  let q = db
    .from("normalized_listings")
    .select(LISTING_COLUMNS)
    .order("last_seen_at", { ascending: false })
    .limit(fetchLimit);

  if (filter.source) q = q.eq("source", filter.source);
  if (filter.region) q = q.eq("region", filter.region);

  const { data: listingData, error: listingErr } = await q;
  if (listingErr) throw listingErr;

  const listings = (listingData ?? []) as ListingRow[];
  const listingIds = listings.map((l) => l.id as string);

  const manualListingIds = await fetchRecentManualListingIds(db, filter, fetchLimit);
  const extraListingIds = manualListingIds.filter((id) => !listingIds.includes(id));
  const extraListings = await fetchListingsByIds(db, extraListingIds, filter);
  const allListings = [...listings, ...extraListings];
  const allListingIds = allListings.map((l) => l.id as string);

  const { valuations, leads } = await loadOpportunityContext(db, allListingIds);
  const manualByListing = await fetchManualSubmissionContext(db, allListingIds);
  const workflowByListing = await fetchWorkflowMap(db, allListingIds);

  const candidateIds = [
    ...new Set(
      buildListingDiagnostics(allListings, valuations, leads)
        .map((d) => d.vehicle_candidate_id)
        .filter((id): id is string => id !== null),
    ),
  ];
  const candidateCounts = await fetchCandidateCounts(db, candidateIds);

  const rows = assembleRows(
    allListings,
    valuations,
    leads,
    candidateCounts,
    manualByListing,
    workflowByListing,
  );
  const filtered = applyListFilter(rows, filter);
  const viewed = applyViewFilter(filtered, filter, workflowByListing);
  sortOpportunityRows(viewed, filter.sort ?? "last_seen_desc");
  return paginateOpportunityRows(viewed, offset, filter.limit);
}

export async function getOpportunityDetail(
  db: SupabaseClient,
  id: string,
): Promise<OpportunityDetail | null> {
  const { data: listingRow, error: listingErr } = await db
    .from("normalized_listings")
    .select(LISTING_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (listingErr) throw listingErr;
  if (!listingRow) return null;

  const listing = listingRow as ListingRow;
  const { valuations, leads } = await loadOpportunityContext(db, [id]);
  const manualByListing = await fetchManualSubmissionContext(db, [id]);
  const workflowByListing = await fetchWorkflowMap(db, [id]);
  const lead = leads[0] ?? null;
  const diagnostics = buildListingDiagnostics([listing], valuations, leads);
  const diagnostic = diagnostics[0]!;

  const candidateId = diagnostic.vehicle_candidate_id;
  let candidateListingCount: number | null = null;
  if (candidateId) {
    const counts = await fetchCandidateCounts(db, [candidateId]);
    candidateListingCount = counts.get(candidateId) ?? null;
  }

  const row = mapToOpportunityRow(
    listing,
    diagnostic,
    lead,
    candidateListingCount,
    manualByListing.get(id) ?? null,
    workflowByListing.get(id) ?? null,
  );
  if (!row) return null;

  const actions = await listOpportunityActions(db, id);
  return mapToOpportunityDetail(row, listing, diagnostic, lead, candidateListingCount, actions);
}

const MAX_FETCH = 500;
