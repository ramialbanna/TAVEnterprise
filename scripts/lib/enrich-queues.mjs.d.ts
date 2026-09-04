export const QUEUE_NAMES: string[];
export const DEALER_SIGNAL_QUEUE: string;
export const DEFAULT_ENRICH_QUEUE: string;
export const NEEDS_ACTION_MAX_AGE_MS: number;
export const CLAIM_EXPIRING_SOON_MS: number;
export const SUPPRESSED_QUEUE_STATUSES: Set<string>;

export function defaultQueue(opts?: { queue?: string | null | undefined }): string;
export function assertQueueName(queue: string | null | undefined): string;
export function needsActionReceivedAt(opts?: {
  receivedAt?: string | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
}): string | null;
export function isWithinNeedsActionAge(row: unknown, now?: Date): boolean;
export function isActiveClaim(workflow: unknown, now?: Date): boolean;
export function isExpiringClaim(workflow: unknown, now?: Date): boolean;
export function matchesWouldBeNeedsAction(ctx: unknown, now?: Date): boolean;
export function isScraperReviewOnlyCandidate(opts: {
  hasLead: boolean;
  hasManual: boolean;
  hasMmrHit: boolean;
}): boolean;
export function buildNeedsActionEnrichContext(opts: {
  listing: { first_seen_at?: string | null; last_seen_at?: string | null };
  lead?: unknown;
  workflow?: unknown;
  manual?: unknown;
  hasMmrHit?: boolean;
}): {
  scraperReviewOnly: boolean;
  opportunityType: string | null;
  manualSubmission: boolean;
  assignedTo: string | null;
  workflowStatus: string | null;
  leadStatus: string | null;
  workflow: unknown;
  receivedAt: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};
