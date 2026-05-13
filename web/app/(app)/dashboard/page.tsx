import {
  getKpis,
  getSystemStatus,
  listHistoricalSales,
} from "@/lib/app-api/server";

import { SystemStatusSection } from "./_components/system-status-section";
import { KpisSection } from "./_components/kpis-section";
import { RegionChartsSection } from "./_components/region-charts-section";
import { GrossTrendSection } from "./_components/gross-trend-section";
import { HistoricalSalesSection } from "./_components/historical-sales-section";
import { FutureMetricsSection } from "./_components/future-metrics-section";

/**
 * `/dashboard` — Phase 2 Task 2.1 shell.
 *
 * Server component: fetches the initial `ApiResult` for system-status, KPIs, and a 100-row
 * page of historical sales in parallel via the server-only `appApiServer` (direct Worker
 * call, no proxy hop). Each result is handed as `initial` to a page-local client section
 * that seeds a TanStack Query of the same shape — so the first paint is server-rendered
 * and client refresh updates in place without a separate dehydrate/HydrationBoundary.
 *
 * No fabricated values. Honest `ApiResult` rendering — `unavailable` and `error` kinds
 * surface through `UnavailableState` / `ErrorState`. `sellThroughRate` is intentionally
 * absent (removed server-side Round 5).
 */
export default async function DashboardPage() {
  const [systemStatus, kpis, historicalSales] = await Promise.all([
    getSystemStatus(),
    getKpis(),
    listHistoricalSales({ limit: 100 }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Live acquisition health, outcomes, and recent sales.
          </p>
        </div>
        <SystemStatusSection initial={systemStatus} />
      </header>

      <section aria-label="Top metrics">
        <KpisSection initial={kpis} />
      </section>

      <section aria-label="Regional outcomes">
        <RegionChartsSection initial={kpis} />
      </section>

      <section aria-label="Gross trend">
        <GrossTrendSection initial={historicalSales} />
      </section>

      <section aria-label="Recent sales">
        <HistoricalSalesSection initial={historicalSales} />
      </section>

      <section aria-label="Future metrics">
        <FutureMetricsSection initial={systemStatus} />
      </section>
    </div>
  );
}
