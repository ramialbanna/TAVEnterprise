import { listOpportunities } from "@/lib/app-api/server";

import { OpportunitiesClient } from "./_components/opportunities-client";

/**
 * `/opportunities` — v2 read-only buyer queue.
 */
export default async function OpportunitiesPage() {
  const initial = await listOpportunities({ limit: 50 });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Opportunities</h1>
        <p className="text-sm text-muted-foreground">
          Review scored leads and near-miss listings in one queue. Compare asking price
          to MMR, scan event badges, and decide what to call, watch, or pass. Read-only
          for now — claim, assign, and notes arrive in later v2 phases.
        </p>
      </header>

      <OpportunitiesClient initial={initial} />
    </div>
  );
}
