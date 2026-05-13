"use client";

import { useQuery } from "@tanstack/react-query";

import { getKpis } from "@/lib/app-api/client";
import { metricBlockResult, type ApiResult } from "@/lib/app-api";
import type { Kpis } from "@/lib/app-api/schemas";
import { queryKeys } from "@/lib/query";
import { BarChartCard } from "@/components/charts";
import { ErrorState, UnavailableState } from "@/components/data-state";

import { GROSS_VALUE_KEYS, HOLD_DAYS_VALUE_KEYS, normalizeByRegion } from "./by-region";

/**
 * Two per-region charts derived from `outcomes.value.byRegion` on `/app/kpis`:
 *
 *   - Gross by region
 *   - Hold days by region
 *
 * Shares the kpis TanStack query key with `KpisSection`, so re-render is cache-deduped.
 * `outcomes.value === null` is isolated from the other KPI blocks — the charts show a
 * single `UnavailableState` here while `Leads` / `Normalized listings` in the KPI grid
 * continue to render their own values. `byRegion: []` shows the BarChartCard's own
 * "No data to display." empty state. Rows missing the metric column are dropped by
 * `normalizeByRegion` — never coerced to `0`. `sellThroughRate` is never rendered.
 */
export function RegionChartsSection({ initial }: { initial: ApiResult<Kpis> }) {
  const query = useQuery({
    queryKey: queryKeys.kpis,
    queryFn: () => getKpis(),
    initialData: initial,
  });

  if (!query.data.ok) {
    return <ErrorState error={query.data} onRetry={() => void query.refetch()} />;
  }

  const outcomesResult = metricBlockResult(query.data.data.outcomes);
  if (!outcomesResult.ok) {
    return <UnavailableState code={outcomesResult.error} title="Region charts unavailable" />;
  }

  const grossData = normalizeByRegion(outcomesResult.data.byRegion, GROSS_VALUE_KEYS);
  const holdDaysData = normalizeByRegion(outcomesResult.data.byRegion, HOLD_DAYS_VALUE_KEYS);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <BarChartCard
        title="Gross by region"
        data={grossData}
        categoryLabel="Region"
        valueLabel="Avg gross profit"
        ariaLabel="Average gross profit by region"
      />
      <BarChartCard
        title="Hold days by region"
        data={holdDaysData}
        categoryLabel="Region"
        valueLabel="Avg hold days"
        ariaLabel="Average hold days by region"
        fill={2}
      />
    </div>
  );
}
