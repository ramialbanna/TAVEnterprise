"use client";

import { useQuery } from "@tanstack/react-query";

import { listHistoricalSales } from "@/lib/app-api/client";
import type { ApiResult } from "@/lib/app-api";
import type { HistoricalSale } from "@/lib/app-api/schemas";
import { queryKeys } from "@/lib/query";
import { LineChartCard } from "@/components/charts";

import { bucketGrossByMonth } from "@/lib/historical-aggregate";

import { renderApiResult } from "./render-api-result";

const HISTORICAL_SALES_LIMIT = 100;

/**
 * Monthly gross-profit area chart from `/app/historical-sales`. Shares the
 * historical-sales TanStack query key with `HistoricalSalesSection` so the same paged
 * fetch backs both surfaces (no duplicate network calls).
 *
 * The caption is explicit that this is the **returned sample** — not a full-database
 * aggregate — so a viewer can never misread a slope as the whole-business trend.
 *
 * Empty / single-month results fall through to `LineChartCard`'s built-in
 * `insufficient` state (`minPoints={2}`). `ApiResult` failures route through
 * `ErrorState` with `query.refetch()` as the retry. Rows missing `saleDate`
 * or `grossProfit` are dropped by `bucketGrossByMonth` — never coerced to `0`.
 */
export function GrossTrendSection({ initial }: { initial: ApiResult<HistoricalSale[]> }) {
  const query = useQuery({
    queryKey: queryKeys.historicalSales({ limit: HISTORICAL_SALES_LIMIT }),
    queryFn: () => listHistoricalSales({ limit: HISTORICAL_SALES_LIMIT }),
    initialData: initial,
  });

  return renderApiResult(
    query.data,
    (rows) => {
      const buckets = bucketGrossByMonth(rows);
      const series = buckets.map((b) => ({ label: b.month, value: b.avgGross }));

      return (
        <LineChartCard
          title="Gross trend (TAV historical sales — returned sample)"
          caption={`Based on the most recent ${rows.length} historical-sales rows returned by the API — not a full-database aggregate.`}
          data={series}
          variant="area"
          minPoints={2}
          categoryLabel="Month"
          valueLabel="Avg gross profit"
          ariaLabel="Monthly average gross profit, returned sample"
        />
      );
    },
    { onRetry: () => void query.refetch() },
  );
}
