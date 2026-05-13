"use client";

import { useQuery } from "@tanstack/react-query";

import { getKpis } from "@/lib/app-api/client";
import { metricBlockResult, type ApiResult } from "@/lib/app-api";
import type { Kpis } from "@/lib/app-api/schemas";
import { queryKeys } from "@/lib/query";
import { KpiCard, KpiGrid } from "@/components/kpi";
import { ErrorState } from "@/components/data-state";

/**
 * `/app/kpis` first paint, seeded from RSC. Renders three top-line metric tiles —
 * outcomes/leads/listings — using `metricBlockResult` so each block branches
 * independently (one unavailable block does not nuke the others).
 *
 * Deliberately omitted: `sellThroughRate` (removed server-side Round 5, do not
 * reintroduce in the client). No fabricated zeroes — every missing block routes
 * through `UnavailableState`/`KpiCard.state="unavailable"`.
 *
 * Task 2.1 scope: top-line tiles only. By-region tiles, gross-trend charts, and
 * other detail surfaces come in Tasks 2.2–2.5.
 */
export function KpisSection({ initial }: { initial: ApiResult<Kpis> }) {
  const query = useQuery({
    queryKey: queryKeys.kpis,
    queryFn: () => getKpis(),
    initialData: initial,
  });

  if (!query.data.ok) {
    return <ErrorState error={query.data} onRetry={() => void query.refetch()} />;
  }

  const { outcomes, leads, listings } = query.data.data;
  const outcomesResult = metricBlockResult(outcomes);
  const leadsResult = metricBlockResult(leads);
  const listingsResult = metricBlockResult(listings);

  return (
    <KpiGrid>
      <KpiCard
        label="Avg gross profit"
        format="money"
        value={outcomesResult.ok ? outcomesResult.data.avgGrossProfit : null}
        state={outcomesResult.ok ? undefined : "unavailable"}
        reason={outcomesResult.ok ? undefined : outcomesResult.error}
      />
      <KpiCard
        label="Total outcomes"
        format="number"
        value={outcomesResult.ok ? outcomesResult.data.totalOutcomes : null}
        state={outcomesResult.ok ? undefined : "unavailable"}
        reason={outcomesResult.ok ? undefined : outcomesResult.error}
      />
      <KpiCard
        label="Leads"
        format="number"
        value={leadsResult.ok ? leadsResult.data.total : null}
        state={leadsResult.ok ? undefined : "unavailable"}
        reason={leadsResult.ok ? undefined : leadsResult.error}
      />
      <KpiCard
        label="Normalized listings"
        format="number"
        value={listingsResult.ok ? listingsResult.data.normalizedTotal : null}
        state={listingsResult.ok ? undefined : "unavailable"}
        reason={listingsResult.ok ? undefined : listingsResult.error}
      />
    </KpiGrid>
  );
}
