import type { Route } from "next";
import type { OpportunityView } from "@/lib/app-api/client";

export type QueueEmptyStateNew = {
  title: string;
  hint: string;
  action?: { label: string; href: Route };
  exampleUrl?: string;
};

export const EMPTY_EXAMPLE_LISTING_URL =
  "https://www.facebook.com/marketplace/item/example-listing/";

export const QUEUE_EMPTY_STATE_NEW: Record<OpportunityView, QueueEmptyStateNew> = {
  needs_action: {
    title: "You're all caught up",
    hint: "Nothing is waiting on you right now. Check Worth a look for strong deals or browse All.",
    action: { label: "Browse worth a look", href: "/opportunities?view=worth_a_look" },
  },
  mine: {
    title: "Nothing assigned to you yet",
    hint: "When a deal is assigned to you or you claim one, it shows up here. You can also claim from Needs action.",
    action: { label: "See needs action", href: "/opportunities?view=needs_action" },
  },
  worth_a_look: {
    title: "No standouts right now",
    hint: "Deals with at least $1,000 room to make and seen in the last week appear here.",
    action: { label: "Submit a listing", href: "/opportunities/submit" },
  },
  scraper_review: {
    title: "No recent scrapes to review",
    hint: "Turn on SCRAPER_REVIEW_MODE on the Worker to surface recent no-MMR scrapes here for soak testing.",
    action: { label: "See needs action", href: "/opportunities?view=needs_action" },
  },
  all: {
    title: "No deals in your queue yet",
    hint: "Paste a marketplace link to add your first deal. Leads and almost-deals from ingest will appear here too.",
    action: { label: "Submit your first listing", href: "/opportunities/submit" },
    exampleUrl: EMPTY_EXAMPLE_LISTING_URL,
  },
};

export function emptyStateForView(view: OpportunityView): QueueEmptyStateNew {
  return QUEUE_EMPTY_STATE_NEW[view];
}
