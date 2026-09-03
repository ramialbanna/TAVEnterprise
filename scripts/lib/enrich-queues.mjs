/**
 * Item 74 — enrich queue selection.
 * Default: Needs-action-only (listings that would land on Needs action once Fly attaches seller_url).
 * Legacy `--queue unprocessed|dealer_*` kept for debugging.
 */

export const QUEUE_NAMES = [
  "needs_action",
  "unprocessed",
  "dealer_dismiss",
  "dealer_listing",
  "dealer_signal",
];
export const DEALER_SIGNAL_QUEUE = "dealer_signal";
export const DEFAULT_ENRICH_QUEUE = "needs_action";

/** Mirror `NEEDS_ACTION_MAX_AGE_MS` in opportunities.ts */
export const NEEDS_ACTION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Mirror `CLAIM_EXPIRING_SOON_MS` in opportunities.ts */
export const CLAIM_EXPIRING_SOON_MS = 4 * 60 * 60 * 1000;

export const SUPPRESSED_QUEUE_STATUSES = new Set([
  "bad_lead",
  "passed",
  "purchased",
  "duplicate",
  "stale",
  "sold",
  "archived",
]);

export function defaultQueue({ queue = null } = {}) {
  if (queue) return queue;
  return DEFAULT_ENRICH_QUEUE;
}

export function assertQueueName(queue) {
  if (queue && !QUEUE_NAMES.includes(queue)) {
    throw new Error(`--queue must be one of: ${QUEUE_NAMES.join(", ")}`);
  }
  return queue ?? DEFAULT_ENRICH_QUEUE;
}

export function needsActionReceivedAt({
  receivedAt = null,
  firstSeenAt = null,
  lastSeenAt = null,
} = {}) {
  return receivedAt ?? firstSeenAt ?? lastSeenAt ?? null;
}

export function isWithinNeedsActionAge(row, now = new Date()) {
  const raw = needsActionReceivedAt(row);
  if (!raw) return true;
  const received = new Date(raw).getTime();
  if (Number.isNaN(received)) return true;
  return now.getTime() - received <= NEEDS_ACTION_MAX_AGE_MS;
}

export function isActiveClaim(workflow, now = new Date()) {
  if (!workflow?.claimedByUserId || !workflow.claimExpiresAt) return false;
  return new Date(workflow.claimExpiresAt).getTime() > now.getTime();
}

export function isExpiringClaim(workflow, now = new Date()) {
  if (!workflow || !isActiveClaim(workflow, now) || !workflow.claimExpiresAt) return false;
  const msLeft = new Date(workflow.claimExpiresAt).getTime() - now.getTime();
  return msLeft > 0 && msLeft <= CLAIM_EXPIRING_SOON_MS;
}

/**
 * Mirror `matchesNeedsAction` in opportunities.ts for enrich queue selection.
 * Callers pass rows that already have seller_url IS NULL — the view filter is not applied here.
 */
export function matchesWouldBeNeedsAction(ctx, now = new Date()) {
  if (ctx.scraperReviewOnly) return false;

  const status =
    ctx.workflowStatus ?? ctx.leadStatus ?? (ctx.manualSubmission ? "new" : null);
  if (status && SUPPRESSED_QUEUE_STATUSES.has(status)) return false;

  if (ctx.workflow && isExpiringClaim(ctx.workflow, now)) return true;
  if (!isWithinNeedsActionAge(ctx, now)) return false;
  if (!ctx.assignedTo) return true;
  if (
    ctx.opportunityType === "manual_submission" &&
    (status === "new" || status === null)
  ) {
    return true;
  }
  return false;
}

/**
 * True when the listing would not appear in production queues at all (scraper-review soak only).
 */
export function isScraperReviewOnlyCandidate({ hasLead, hasManual, hasMmrHit }) {
  return !hasLead && !hasManual && !hasMmrHit;
}

export function buildNeedsActionEnrichContext({
  listing,
  lead = null,
  workflow = null,
  manual = null,
  hasMmrHit = false,
}) {
  const hasLead = lead != null;
  const hasManual = manual != null;
  const scraperReviewOnly = isScraperReviewOnlyCandidate({ hasLead, hasManual, hasMmrHit });

  let opportunityType = null;
  if (hasManual) opportunityType = "manual_submission";
  else if (hasLead) opportunityType = "lead";
  else if (hasMmrHit) opportunityType = "near_miss";

  const assignedTo =
    workflow?.assignedToUserId ??
    manual?.assignedToUserId ??
    (lead ? lead.assigned_to ?? null : null);

  return {
    scraperReviewOnly,
    opportunityType,
    manualSubmission: hasManual,
    assignedTo,
    workflowStatus: workflow?.status ?? null,
    leadStatus: lead?.status ?? null,
    workflow,
    receivedAt: lead?.created_at ?? manual?.submittedAt ?? null,
    firstSeenAt: listing.first_seen_at ?? null,
    lastSeenAt: listing.last_seen_at ?? null,
  };
}
