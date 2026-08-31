import { NewModeOpsGuard } from "@/components/app-shell/new-mode-ops-guard";

import { HistoricalClient } from "./_components/historical-client";

/**
 * `/historical` — TAV historical sales explorer.
 *
 * Item 58: chrome is RSC; the first unfiltered page loads on the client so
 * sidebar switches are not blocked on Worker SQL.
 */
export default function HistoricalPage() {
  return (
    <NewModeOpsGuard>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">TAV Historical Data</h1>
          <p className="text-sm text-muted-foreground">
            Explore prior TAV sales by year, make, model, trim, VIN presence, and gross
            range. Server filters are applied at the API; the rest run in the browser.
          </p>
        </header>

        <HistoricalClient />
      </div>
    </NewModeOpsGuard>
  );
}
