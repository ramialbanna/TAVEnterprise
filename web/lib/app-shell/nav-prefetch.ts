import type { QueryClient } from "@tanstack/react-query";

import type { ApiResult } from "@/lib/app-api";
import {
  getKpis,
  getSystemStatus,
  listHistoricalSales,
  listIngestRuns,
} from "@/lib/app-api/client";
import type { AppUser } from "@/lib/app-api/schemas";
import { prefetchNavHref as prefetchQueueNavHref } from "@/lib/opportunities/queue-prefetch";
import {
  HISTORICAL_SALES_DEFAULT_LIMIT,
  INGEST_RUNS_DEFAULT_LIMIT,
  queryKeys,
} from "@/lib/query";

const NAV_STALE_TIME_MS = 60_000;

function prefetch<T>(queryClient: QueryClient, queryKey: readonly unknown[], queryFn: () => Promise<T>): void {
  void queryClient.prefetchQuery({
    queryKey,
    queryFn,
    staleTime: NAV_STALE_TIME_MS,
  });
}

export function prefetchAnalytics(queryClient: QueryClient): void {
  prefetch(queryClient, queryKeys.kpis, getKpis);
  prefetch(queryClient, queryKeys.systemStatus, getSystemStatus);
  prefetch(
    queryClient,
    queryKeys.historicalSales({ limit: HISTORICAL_SALES_DEFAULT_LIMIT }),
    () => listHistoricalSales({ limit: HISTORICAL_SALES_DEFAULT_LIMIT }),
  );
}

export function prefetchIngestMonitor(queryClient: QueryClient): void {
  prefetch(queryClient, queryKeys.ingestRuns({ limit: INGEST_RUNS_DEFAULT_LIMIT }), () =>
    listIngestRuns({ limit: INGEST_RUNS_DEFAULT_LIMIT }),
  );
}

export function prefetchHistoricalData(queryClient: QueryClient): void {
  prefetch(
    queryClient,
    queryKeys.historicalSales({ limit: HISTORICAL_SALES_DEFAULT_LIMIT }),
    () => listHistoricalSales({ limit: HISTORICAL_SALES_DEFAULT_LIMIT }),
  );
}

export function prefetchAdminStatus(queryClient: QueryClient): void {
  prefetch(queryClient, queryKeys.systemStatus, getSystemStatus);
}

/**
 * Sidebar / tile hover — warm the destination React Query cache before the click.
 * Queue destinations stay in `queue-prefetch`; this covers the rest of the menu.
 */
export function prefetchNavHref(
  queryClient: QueryClient,
  href: string,
  me?: ApiResult<AppUser>,
): void {
  prefetchQueueNavHref(queryClient, href, me);

  if (href === "/dashboard/analytics" || href.startsWith("/dashboard/analytics?")) {
    prefetchAnalytics(queryClient);
    return;
  }
  if (href === "/ingest" || href.startsWith("/ingest?")) {
    prefetchIngestMonitor(queryClient);
    return;
  }
  if (href === "/historical" || href.startsWith("/historical?")) {
    prefetchHistoricalData(queryClient);
    return;
  }
  if (href === "/admin" || href.startsWith("/admin?")) {
    prefetchAdminStatus(queryClient);
  }
}
