import { listOpportunities, listOpportunitiesPage } from "@/lib/app-api/server";

import { OpportunitiesInterfaceClient } from "./_components/opportunities-interface-client";

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
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Opportunities</h1>
        <p className="text-sm text-muted-foreground">
          Review scored leads, near-miss listings, and finder submissions in one queue.
          Compare asking price to MMR, scan event badges, submit listing links, then claim,
          update status, and add notes.
        </p>
      </header>

      <OpportunitiesInterfaceClient initialClassic={initialClassic} initialNew={initialNew} />
    </div>
  );
}
