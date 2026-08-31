"use client";

import { useQuery } from "@tanstack/react-query";

import { listHistoricalSales } from "@/lib/app-api/client";
import type { ApiResult } from "@/lib/app-api";
import type { HistoricalSale } from "@/lib/app-api/schemas";
import { HISTORICAL_SALES_DEFAULT_LIMIT, queryKeys } from "@/lib/query";
import { EmptyState } from "@/components/data-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";

import { renderApiResult } from "./render-api-result";

/**
 * `/app/historical-sales` first paint. Empty result renders `EmptyState`; failures
 * route through `renderApiResult` (unavailable → muted panel; other kinds → ErrorState).
 */
export function HistoricalSalesSection({ initial }: { initial?: ApiResult<HistoricalSale[]> }) {
  const query = useQuery({
    queryKey: queryKeys.historicalSales({ limit: HISTORICAL_SALES_DEFAULT_LIMIT }),
    queryFn: () => listHistoricalSales({ limit: HISTORICAL_SALES_DEFAULT_LIMIT }),
    ...(initial !== undefined ? { initialData: initial } : {}),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Recent sales
        </CardTitle>
      </CardHeader>
      <CardContent>
        {renderApiResult(
          query.data,
          (rows) =>
            rows.length === 0 ? (
              <EmptyState
                title="No sales yet"
                hint="Once outcomes are imported, the most recent will appear here."
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {formatNumber(rows.length)} row{rows.length === 1 ? "" : "s"} loaded.{" "}
                <span className="text-xs">Full table arrives in a follow-up task.</span>
              </p>
            ),
          { onRetry: () => void query.refetch() },
        )}
      </CardContent>
    </Card>
  );
}
