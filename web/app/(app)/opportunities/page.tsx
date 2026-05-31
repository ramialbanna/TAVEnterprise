import { listOpportunities, listOpportunitiesPage } from "@/lib/app-api/server";
import { DEFAULT_QUEUE_VIEW } from "@/lib/opportunities/queue-views";

import { OpportunitiesInterfaceClient } from "./_components/opportunities-interface-client";
import { OpportunitiesPageIntro } from "./_components/opportunities-page-intro";

/**
 * `/opportunities` — v2 read-only buyer queue.
 */
export default async function OpportunitiesPage() {
  const [initialClassic, initialNew] = await Promise.all([
    listOpportunities({ limit: 50 }),
    listOpportunitiesPage({
      limit: 25,
      offset: 0,
      sort: "spread_desc",
      view: DEFAULT_QUEUE_VIEW,
    }),
  ]);

  return (
    <div className="space-y-6">
      <OpportunitiesPageIntro />

      <OpportunitiesInterfaceClient initialClassic={initialClassic} initialNew={initialNew} />
    </div>
  );
}
