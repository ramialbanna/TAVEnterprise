import { listHistoricalSales } from "@/lib/app-api/server";

import { HistoricalClient } from "./_components/historical-client";

/**
 * `/historical` — TAV historical sales explorer.
 *
 * Server component shell. Fetches the initial unfiltered page (limit 100) via
 * `appApiServer.listHistoricalSales` and hands the `ApiResult` to a client wrapper
 * that owns filter state. The narrow first-paint payload keeps the dashboard quiet
 * footprint; deeper drill-downs (the full DataTable, segment charts, gross histogram)
 * arrive in follow-up Phase 4 tasks.
 */
export default async function HistoricalPage() {
  const initial = await listHistoricalSales({ limit: 100 });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">TAV Historical Data</h1>
        <p className="text-sm text-muted-foreground">
          Explore prior TAV sales by year, make, model, trim, VIN presence, and gross
          range. Server filters are applied at the API; the rest run in the browser.
        </p>
      </header>

      <HistoricalClient initial={initial} />
    </div>
  );
}
