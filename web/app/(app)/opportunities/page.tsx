import { Suspense } from "react";

import type { OpportunityView } from "@/lib/app-api/client";
import { DEFAULT_QUEUE_VIEW } from "@/lib/opportunities/queue-views";

import { OpportunitiesInterfaceClient } from "./_components/opportunities-interface-client";
import { OpportunitiesPageIntro } from "./_components/opportunities-page-intro";

const QUEUE_VIEWS = new Set<OpportunityView>([
  "needs_action",
  "mine",
  "worth_a_look",
  "scraper_review",
  "flagged_leads",
  "all",
]);

function parseQueueView(raw: string | undefined): OpportunityView {
  if (raw && QUEUE_VIEWS.has(raw as OpportunityView)) return raw as OpportunityView;
  return DEFAULT_QUEUE_VIEW;
}

/**
 * `/opportunities` — v2 buyer queue.
 *
 * Item 58: do not await Worker SQL here. A blocking RSC fetch of the 500-row
 * queue is what made Home ↔ Opportunities feel like ~10s. The client loads
 * (and shows cached) rows via React Query after paint.
 */
export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: viewParam } = await searchParams;
  const initialView = parseQueueView(viewParam);

  return (
    <div className="space-y-6">
      <OpportunitiesPageIntro />

      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading queue…</p>}>
        <OpportunitiesInterfaceClient initialView={initialView} />
      </Suspense>
    </div>
  );
}
