"use client";

import type { ApiResult } from "@/lib/app-api";
import type { HistoricalSale, Kpis, SystemStatus } from "@/lib/app-api/schemas";
import { useInterface } from "@/lib/interface/interface-provider";

import { FutureMetricsSection } from "./future-metrics-section";
import { GrossTrendSection } from "./gross-trend-section";
import { HistoricalSalesSection } from "./historical-sales-section";
import { KpisSection } from "./kpis-section";
import { RegionChartsSection } from "./region-charts-section";
import { SystemStatusSection } from "./system-status-section";
import { DashboardHomeNew } from "./dashboard-home-new";

export function DashboardInterfaceClient({
  systemStatus,
  kpis,
  historicalSales,
  homeCounts,
}: {
  systemStatus: ApiResult<SystemStatus>;
  kpis: ApiResult<Kpis>;
  historicalSales: ApiResult<HistoricalSale[]>;
  homeCounts: { needsYou?: number; mine?: number };
}) {
  const { interfaceMode } = useInterface();

  if (interfaceMode === "new") {
    return <DashboardHomeNew initialCounts={homeCounts} />;
  }

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
