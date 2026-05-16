"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { listIngestRuns } from "@/lib/app-api/client";
import type { ApiResult } from "@/lib/app-api";
import type { IngestRunSummary } from "@/lib/app-api/schemas";
import { queryKeys } from "@/lib/query";
import { ErrorState, UnavailableState } from "@/components/data-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatDateTime } from "@/lib/format";

import { IngestTable } from "./ingest-table";
import { RunDetailSheet } from "./run-detail-sheet";

const LIST_LIMIT = 50;

/**
 * Client wrapper for `/ingest`. Owns the recent-runs query (seeded from the RSC
 * first paint) and the selected-run drawer. Honest states only: `unavailable` →
 * muted `UnavailableState`; other failures → `ErrorState` (+ Retry when
 * retryable); `unauthorized` → `ErrorState` sign-in. No demo/fallback data.
 */
export function IngestClient({ initial }: { initial: ApiResult<IngestRunSummary[]> }) {
  const [selected, setSelected] = useState<IngestRunSummary | null>(null);

  const query = useQuery({
    queryKey: queryKeys.ingestRuns({ limit: LIST_LIMIT }),
    queryFn: () => listIngestRuns({ limit: LIST_LIMIT }),
    initialData: initial,
  });

  const result = query.data;

  if (result === undefined) {
    return <p className="text-sm text-muted-foreground">Loading ingest runs…</p>;
  }

  if (!result.ok) {
    return (
      <Card>
        <CardContent className="pt-6">
          {result.kind === "unavailable" ? (
            <UnavailableState code={result.error} title="Ingest runs unavailable" />
          ) : (
            <ErrorState error={result} onRetry={() => void query.refetch()} />
          )}
        </CardContent>
      </Card>
    );
  }

  const runs = result.data;
  const latest = runs[0] ?? null;

  return (
    <div className="space-y-4">
      {latest ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Latest run
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral">{latest.status}</Badge>
              <span className="font-medium">
                {latest.source} · {latest.region}
              </span>
              <span className="text-muted-foreground">{latest.run_id}</span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 tabular-nums">
              <span>Processed listings: {formatNumber(latest.processed)}</span>
              <span>Rejected listings: {formatNumber(latest.rejected)}</span>
              <span>Created leads: {formatNumber(latest.created_leads)}</span>
              <span>Scraped {formatDateTime(latest.scraped_at)}</span>
            </div>
            {latest.error_message ? (
              <p className="text-destructive">{latest.error_message}</p>
            ) : null}
            <button
              type="button"
              className="text-xs font-medium text-primary underline underline-offset-2"
              onClick={() => setSelected(latest)}
            >
              Inspect diagnostics
            </button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Run history
          </CardTitle>
        </CardHeader>
        <CardContent>
          <IngestTable
            rows={runs}
            loading={query.isLoading}
            onSelect={(run) => setSelected(run)}
            emptyTitle="No ingest runs"
            emptyHint="No source runs have been recorded yet. Once the Apify schedule fires, runs appear here newest-first."
          />
          <p className="pt-3 text-xs text-muted-foreground">
            Showing the {LIST_LIMIT} most recent runs. Select a row to inspect
            rejection, valuation-miss, schema-drift, and created-lead diagnostics.
          </p>
        </CardContent>
      </Card>

      <RunDetailSheet run={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
