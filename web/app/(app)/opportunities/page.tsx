import { listOpportunities, listOpportunitiesPage } from "@/lib/app-api/server";

import { OpportunitiesInterfaceClient } from "./_components/opportunities-interface-client";
import { OpportunitiesPageIntro } from "./_components/opportunities-page-intro";

/**
 * `/opportunities` — v2 read-only buyer queue.
 */
export default async function OpportunitiesPage() {
  const [initialClassic, initialNew] = await Promise.all([
    listOpportunities({ limit: 50 }),
    listOpportunitiesPage({ limit: 50, offset: 0, sort: "spread_desc", view: "all" }),
  ]);

  return (
    <div className="space-y-6">
      <OpportunitiesPageIntro />

      <OpportunitiesInterfaceClient initialClassic={initialClassic} initialNew={initialNew} />
    </div>
  );
}
