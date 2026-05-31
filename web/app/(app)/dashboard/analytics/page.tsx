import {
  getKpis,
  getSystemStatus,
  listHistoricalSales,
} from "@/lib/app-api/server";

import { FutureMetricsSection } from "../_components/future-metrics-section";
import { GrossTrendSection } from "../_components/gross-trend-section";
import { HistoricalSalesSection } from "../_components/historical-sales-section";
import { KpisSection } from "../_components/kpis-section";
import { RegionChartsSection } from "../_components/region-charts-section";
import { SystemStatusSection } from "../_components/system-status-section";
import { DashboardAnalyticsGate } from "../_components/dashboard-analytics-gate";

/**
 * `/dashboard/analytics` — KPIs and charts (New-mode nav). Classic users keep `/dashboard`.
 */
export default async function DashboardAnalyticsPage() {
  const [systemStatus, kpis, historicalSales] = await Promise.all([
    getSystemStatus(),
    getKpis(),
    listHistoricalSales({ limit: 100 }),
  ]);

  return (
    <DashboardAnalyticsGate>
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
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
    </DashboardAnalyticsGate>
  );
}
