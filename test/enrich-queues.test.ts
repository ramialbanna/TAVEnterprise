import { describe, expect, it } from "vitest";
import {
  CLAIM_EXPIRING_SOON_MS,
  DEFAULT_ENRICH_QUEUE,
  assertQueueName,
  buildNeedsActionEnrichContext,
  defaultQueue,
  isExpiringClaim,
  isWithinNeedsActionAge,
  matchesWouldBeNeedsAction,
} from "@scripts/enrich-queues";

describe("enrich queues", () => {
  it("defaults to needs_action (not Unprocessed ocean)", () => {
    expect(defaultQueue({})).toBe(DEFAULT_ENRICH_QUEUE);
    expect(defaultQueue({ queue: "dealer_signal" })).toBe("dealer_signal");
    expect(assertQueueName(null)).toBe("needs_action");
  });

  it("rejects unknown queue names", () => {
    expect(() => assertQueueName("bogus")).toThrow(/--queue must be one of/);
    expect(assertQueueName("needs_action")).toBe("needs_action");
    expect(assertQueueName("unprocessed")).toBe("unprocessed");
  });
});

describe("matchesWouldBeNeedsAction", () => {
  const now = new Date("2026-09-03T12:00:00.000Z");
  const recent = "2026-09-03T10:00:00.000Z";
  const stale = "2026-09-01T10:00:00.000Z";

  it("accepts unassigned lead within 24h", () => {
    const ctx = buildNeedsActionEnrichContext({
      listing: { first_seen_at: recent, last_seen_at: recent },
      lead: { created_at: recent, status: "new", assigned_to: null },
      hasMmrHit: true,
    });
    expect(matchesWouldBeNeedsAction(ctx, now)).toBe(true);
  });

  it("rejects scraper-review-only candidates", () => {
    const ctx = buildNeedsActionEnrichContext({
      listing: { first_seen_at: recent, last_seen_at: recent },
    });
    expect(ctx.scraperReviewOnly).toBe(true);
    expect(matchesWouldBeNeedsAction(ctx, now)).toBe(false);
  });

  it("rejects suppressed workflow status", () => {
    const ctx = buildNeedsActionEnrichContext({
      listing: { first_seen_at: recent, last_seen_at: recent },
      lead: { created_at: recent, status: "new", assigned_to: null },
      workflow: { status: "bad_lead", claimedByUserId: null, claimExpiresAt: null },
      hasMmrHit: true,
    });
    expect(matchesWouldBeNeedsAction(ctx, now)).toBe(false);
  });

  it("rejects assigned lead outside expiring-claim window", () => {
    const ctx = buildNeedsActionEnrichContext({
      listing: { first_seen_at: recent, last_seen_at: recent },
      lead: {
        created_at: recent,
        status: "new",
        assigned_to: "user-1",
      },
      hasMmrHit: true,
    });
    expect(matchesWouldBeNeedsAction(ctx, now)).toBe(false);
  });

  it("accepts expiring claim even when assigned", () => {
    const expiresAt = new Date(now.getTime() + CLAIM_EXPIRING_SOON_MS - 60_000).toISOString();
    const ctx = buildNeedsActionEnrichContext({
      listing: { first_seen_at: recent, last_seen_at: recent },
      lead: {
        created_at: recent,
        status: "reviewed",
        assigned_to: "user-1",
      },
      workflow: {
        status: "reviewed",
        assignedToUserId: "user-1",
        claimedByUserId: "user-1",
        claimExpiresAt: expiresAt,
      },
      hasMmrHit: true,
    });
    expect(isExpiringClaim(ctx.workflow, now)).toBe(true);
    expect(matchesWouldBeNeedsAction(ctx, now)).toBe(true);
  });

  it("rejects listings older than the Needs action window", () => {
    const ctx = buildNeedsActionEnrichContext({
      listing: { first_seen_at: stale, last_seen_at: stale },
      lead: { created_at: stale, status: "new", assigned_to: null },
      hasMmrHit: true,
    });
    expect(isWithinNeedsActionAge(ctx, now)).toBe(false);
    expect(matchesWouldBeNeedsAction(ctx, now)).toBe(false);
  });

  it("accepts manual submission in new status", () => {
    const ctx = buildNeedsActionEnrichContext({
      listing: { first_seen_at: recent, last_seen_at: recent },
      manual: {
        submittedAt: recent,
        assignedToUserId: "closer-1",
      },
      hasMmrHit: false,
    });
    expect(matchesWouldBeNeedsAction(ctx, now)).toBe(true);
  });
});
