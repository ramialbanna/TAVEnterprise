"use client";

import { useQuery } from "@tanstack/react-query";

import { getKpis } from "@/lib/app-api/client";
import { metricBlockResult, type ApiResult } from "@/lib/app-api";
import type { Kpis } from "@/lib/app-api/schemas";
import { queryKeys } from "@/lib/query";
import { KpiCard, KpiGrid } from "@/components/kpi";

import { renderApiResult } from "./render-api-result";

/**
 * `/app/kpis` first paint, seeded from RSC. Renders three top-line metric tiles —
 * outcomes/leads/listings — using `metricBlockResult` so each block branches
 * independently (one unavailable block does not nuke the others).
 *
 * Deliberately omitted: `sellThroughRate` (removed server-side Round 5, do not
 * reintroduce in the client). No fabricated zeroes — every missing block routes
 * through `UnavailableState`/`KpiCard.state="unavailable"`.
 *
 * Cards (Task 2.2): Total outcomes, Avg gross profit, Avg hold days, Last outcome at,
 * Leads total, Normalized listings. By-region tiles, gross-trend charts, and other
 * detail surfaces come in Tasks 2.4–2.5.
 */
export function KpisSection({ initial }: { initial: ApiResult<Kpis> }) {
  const query = useQuery({
    queryKey: queryKeys.kpis,
    queryFn: () => getKpis(),
    initialData: initial,
  });

  return renderApiResult(
    query.data,
    (data) => {
      const outcomesResult = metricBlockResult(data.outcomes);
      const leadsResult = metricBlockResult(data.leads);
      const listingsResult = metricBlockResult(data.listings);

      const outcomesState = outcomesResult.ok ? undefined : "unavailable";
      const outcomesReason = outcomesResult.ok ? undefined : outcomesResult.error;
      const leadsState = leadsResult.ok ? undefined : "unavailable";
      const leadsReason = leadsResult.ok ? undefined : leadsResult.error;
      const listingsState = listingsResult.ok ? undefined : "unavailable";
      const listingsReason = listingsResult.ok ? undefined : listingsResult.error;

      return (
        <KpiGrid>
          <KpiCard
            label="Total outcomes"
            format="number"
            value={outcomesResult.ok ? outcomesResult.data.totalOutcomes : null}
            state={outcomesState}
            reason={outcomesReason}
          />
          <KpiCard
            label="Avg gross profit"
            format="money"
            value={outcomesResult.ok ? outcomesResult.data.avgGrossProfit : null}
            state={outcomesState}
            reason={outcomesReason}
          />
          <KpiCard
            label="Avg hold days"
            format="number"
            digits={1}
            value={outcomesResult.ok ? outcomesResult.data.avgHoldDays : null}
            state={outcomesState}
            reason={outcomesReason}
          />
          <KpiCard
            label="Last outcome at"
            format="relativeDate"
            value={outcomesResult.ok ? outcomesResult.data.lastOutcomeAt : null}
            state={outcomesState}
            reason={outcomesReason}
          />
          <KpiCard
            label="Leads"
            format="number"
            value={leadsResult.ok ? leadsResult.data.total : null}
            state={leadsState}
            reason={leadsReason}
          />
          <KpiCard
            label="Normalized listings"
            format="number"
            value={listingsResult.ok ? listingsResult.data.normalizedTotal : null}
            state={listingsState}
            reason={listingsReason}
          />
        </KpiGrid>
      );
    },
    { onRetry: () => void query.refetch() },
  );
}
