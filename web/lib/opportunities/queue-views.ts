import type { OpportunityView } from "@/lib/app-api/client";
import type { OpportunityRow } from "@/lib/app-api/schemas";

export const DEFAULT_QUEUE_VIEW: OpportunityView = "needs_action";

export const QUEUE_VIEWS: readonly { value: OpportunityView; label: string }[] = [
  { value: "needs_action", label: "Needs action" },
  { value: "mine", label: "Mine" },
  { value: "worth_a_look", label: "Worth a look" },
  { value: "scraper_review", label: "Unprocessed Leads" },
  { value: "flagged_leads", label: "Flagged Leads" },
  { value: "all", label: "All" },
] as const;

export type QueueEmptyCopy = { title: string; hint: string };

export const QUEUE_EMPTY_COPY: Record<OpportunityView, QueueEmptyCopy> = {
  needs_action: {
    title: "You're all caught up",
    hint: "Nothing is waiting on you right now. Check Worth a look for strong deals or browse All.",
  },
  mine: {
    title: "Nothing assigned to you yet",
    hint: "When a deal is assigned to you or you claim one, it will show up here.",
  },
  worth_a_look: {
    title: "No standouts right now",
    hint: "Deals with at least $1,000 room to make and seen in the last week appear here.",
  },
  scraper_review: {
    title: "No unprocessed leads right now",
    hint: "When scraper review mode is on, recent listings without MMR (and soft near misses) appear here for soak — not as buy-box leads.",
  },
  flagged_leads: {
    title: "No flagged leads",
    hint: "Deals flagged as bad leads are hidden from the main queue and kept here for reference.",
  },
  all: {
    title: "No deals in your queue yet",
    hint: "Leads, almost-deals, and team submissions show up here. Submit a listing link with the button above.",
  },
};

/** True when `firstSeenAt` falls on the same local calendar day as `now`. */
export function isFirstSeenToday(
  firstSeenAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!firstSeenAt) return false;
  const seen = new Date(firstSeenAt);
  if (Number.isNaN(seen.getTime())) return false;
  return (
    seen.getFullYear() === now.getFullYear() &&
    seen.getMonth() === now.getMonth() &&
    seen.getDate() === now.getDate()
  );
}

export function countFirstSeenToday(
  rows: readonly Pick<OpportunityRow, "firstSeenAt">[],
  now: Date = new Date(),
): number {
  return rows.filter((row) => isFirstSeenToday(row.firstSeenAt, now)).length;
}

/** Human summary for the queue header (e.g. "3 need you · 12 new today"). */
export function formatQueueSummaryLine(input: { needsYou: number; newToday: number }): string {
  const needsPart =
    input.needsYou > 0
      ? `${input.needsYou} need you`
      : "Nothing needs you right now";
  const todayPart =
    input.newToday > 0 ? `${input.newToday} new today` : "No new listings today";
  return `${needsPart} · ${todayPart}`;
}

export function emptyCopyForView(view: OpportunityView): QueueEmptyCopy {
  return QUEUE_EMPTY_COPY[view];
}
