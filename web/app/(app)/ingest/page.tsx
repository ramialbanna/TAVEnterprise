import { listIngestRuns } from "@/lib/app-api/server";

import { IngestClient } from "./_components/ingest-client";

/**
 * `/ingest` — Ingest Monitor.
 *
 * Server component shell. Fetches the recent source-run list (newest first,
 * limit 50) via `appApiServer.listIngestRuns` and hands the `ApiResult` to the
 * client wrapper, which owns the selected-run drawer. Real backend values only —
 * no demo/fallback data. Backed by the deployed `/app/ingest-runs` API.
 */
export default async function IngestPage() {
  const initial = await listIngestRuns({ limit: 50 });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Ingest Monitor</h1>
        <p className="text-sm text-muted-foreground">
          Recent Apify / source runs and why a run did or did not produce leads.
          Select a run to inspect raw vs. normalized counts, rejection and
          valuation-miss reasons, schema drift, and created leads.
        </p>
      </header>

      <IngestClient initial={initial} />
    </div>
  );
}
