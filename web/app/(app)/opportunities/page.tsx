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
          Review scored leads, near-miss listings, and finder submissions in one queue.
          Compare asking price to MMR, scan event badges, and submit new listing links.
          Claim, reassign, and workflow notes arrive in the next phase.
        </p>
      </header>

      <OpportunitiesClient initial={initial} />
    </div>
  );
}
