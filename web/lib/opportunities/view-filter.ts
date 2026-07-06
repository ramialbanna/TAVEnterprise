import type { OpportunityView } from "@/lib/app-api/client";
import type { OpportunityRow } from "@/lib/app-api/schemas";

/** Mirrors Worker `src/persistence/opportunities.ts` view rules for client-side fallback. */
export const WORTH_A_LOOK_MIN_SPREAD = 1_000;
export const WORTH_A_LOOK_MAX_STALE_DAYS = 7;
export const CLAIM_EXPIRING_SOON_MS = 4 * 60 * 60 * 1000;

function isClaimActive(claimExpiresAt: string | null, now: Date): boolean {
  if (!claimExpiresAt) return false;
  return new Date(claimExpiresAt).getTime() > now.getTime();
}

export function matchesNeedsAction(row: OpportunityRow, now: Date = new Date()): boolean {
  if (!row.assignedTo) return true;
  if (row.type === "manual_submission" && (row.status === "new" || row.status === null)) {
    return true;
  }
  if (isClaimActive(row.claimExpiresAt, now)) {
    const msLeft = new Date(row.claimExpiresAt!).getTime() - now.getTime();
    if (msLeft > 0 && msLeft <= CLAIM_EXPIRING_SOON_MS) return true;
  }
  return false;
}

export function matchesMine(
  row: OpportunityRow,
  viewerUserId: string,
  viewerDisplayName?: string | null,
): boolean {
  if (row.assignedTo === viewerUserId) return true;
  if (!isClaimActive(row.claimExpiresAt, new Date())) return false;
  // Worker exposes display name when known; otherwise `claimedBy` is the user id.
  if (row.claimedBy === viewerUserId) return true;
  if (viewerDisplayName && row.claimedBy === viewerDisplayName) return true;
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

export function filterOpportunityRowsByView(
  rows: OpportunityRow[],
  view: OpportunityView | undefined,
  options?: { viewerUserId?: string; viewerDisplayName?: string | null; now?: Date },
): OpportunityRow[] {
  if (!view || view === "all") return rows;
  const now = options?.now ?? new Date();
  const viewerUserId = options?.viewerUserId;
  const viewerDisplayName = options?.viewerDisplayName;

  return rows.filter((row) => {
    switch (view) {
      case "needs_action":
        return matchesNeedsAction(row, now);
      case "mine":
        return viewerUserId ? matchesMine(row, viewerUserId, viewerDisplayName) : false;
      case "worth_a_look":
        return matchesWorthALook(row, now);
      default:
        return true;
    }
  });
}

/** True when the Worker returned a full in-memory list, not a server-paginated slice. */
export function isFullListPage(items: OpportunityRow[], total: number, offset: number): boolean {
  return offset === 0 && items.length > 0 && items.length === total;
}

/**
 * Re-apply view rules only when the Worker page body is inconsistent with `total`
 * (extra rows in `items` beyond the reported filtered count). Classic-array fallback
 * is handled separately in `opportunities-page-fetch.ts`.
 */
export function shouldApplyClientViewFilter(
  filter: { view?: OpportunityView; offset?: number },
  page: { items: OpportunityRow[]; total: number; offset: number },
): boolean {
  if (!filter.view || filter.view === "all") return false;
  if (page.offset > 0 || (filter.offset ?? 0) > 0) return false;
  return page.items.length > page.total;
}
