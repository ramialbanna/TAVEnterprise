import { FutureMetricsSection } from "../_components/future-metrics-section";
import { GrossTrendSection } from "../_components/gross-trend-section";
import { HistoricalSalesSection } from "../_components/historical-sales-section";
import { KpisSection } from "../_components/kpis-section";
import { RegionChartsSection } from "../_components/region-charts-section";
import { SystemStatusSection } from "../_components/system-status-section";
import { DashboardAnalyticsGate } from "../_components/dashboard-analytics-gate";

/**
 * `/dashboard/analytics` — KPIs and charts (New-mode nav).
 *
 * Item 58: do not await Worker SQL here. Next.js holds the previous page until
 * this RSC finishes; KPIs / status / sales load on the client from the shared
 * QueryClient (hover-prefetch warms the cache).
 */
export default function DashboardAnalyticsPage() {
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
          <SystemStatusSection />
        </header>

        <section aria-label="Top metrics">
          <KpisSection />
        </section>

        <section aria-label="Regional outcomes">
          <RegionChartsSection />
        </section>

        <section aria-label="Gross trend">
          <GrossTrendSection />
        </section>

        <section aria-label="Recent sales">
          <HistoricalSalesSection />
        </section>

        <section aria-label="Future metrics">
          <FutureMetricsSection />
        </section>
      </div>
    </DashboardAnalyticsGate>
  );
}
