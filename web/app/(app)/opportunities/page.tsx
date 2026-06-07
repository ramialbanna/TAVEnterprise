import { Suspense } from "react";

import type { OpportunityView } from "@/lib/app-api/client";
import { listOpportunitiesPage } from "@/lib/app-api/server";
import { DEFAULT_QUEUE_VIEW } from "@/lib/opportunities/queue-views";

import { OpportunitiesInterfaceClient } from "./_components/opportunities-interface-client";
import { OpportunitiesPageIntro } from "./_components/opportunities-page-intro";

const QUEUE_VIEWS = new Set<OpportunityView>(["needs_action", "mine", "worth_a_look", "all"]);

function parseQueueView(raw: string | undefined): OpportunityView {
  if (raw && QUEUE_VIEWS.has(raw as OpportunityView)) return raw as OpportunityView;
  return DEFAULT_QUEUE_VIEW;
}

/**
 * `/opportunities` — v2 buyer queue.
 */
export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: viewParam } = await searchParams;
  const initialView = parseQueueView(viewParam);

  const initialNew = await listOpportunitiesPage({
    limit: 25,
    offset: 0,
    sort: "spread_desc",
    view: initialView,
  });

  return (
    <div className="space-y-6">
      <OpportunitiesPageIntro />

      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading queue…</p>}>
        <OpportunitiesInterfaceClient initialNew={initialNew} initialView={initialView} />
      </Suspense>
    </div>
  );
}
