import { NewModeOpsGuard } from "@/components/app-shell/new-mode-ops-guard";

import { IngestClient } from "./_components/ingest-client";

/**
 * `/ingest` — Ingest Monitor.
 *
 * Item 58: chrome is RSC; the run list loads on the client so sidebar switches
 * are not blocked on Worker SQL.
 */
export default function IngestPage() {
  return (
    <NewModeOpsGuard>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Ingest Monitor</h1>
          <p className="text-sm text-muted-foreground">
            Recent Apify / source runs and why a run did or did not produce leads.
            Select a run to inspect raw vs. normalized counts, rejection and
            valuation-miss reasons, schema drift, and created leads.
          </p>
        </header>

        <IngestClient />
      </div>
    </NewModeOpsGuard>
  );
}
