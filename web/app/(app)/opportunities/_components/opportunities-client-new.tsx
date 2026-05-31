"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { listOpportunitiesPage, type OpportunitiesPageFilter } from "@/lib/app-api/client";
import type { ApiResult } from "@/lib/app-api";
import type { OpportunityListPage } from "@/lib/app-api/schemas";
import { queryKeys } from "@/lib/query";
import { ErrorState, UnavailableState } from "@/components/data-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { OpportunitiesTable } from "./opportunities-table";
import { OpportunityPreviewSheet } from "./opportunity-preview-sheet";
import { ManualSubmitDialog } from "./manual-submit-dialog";
import type { OpportunityRow } from "@/lib/app-api/schemas";

const LIST_FILTER: OpportunitiesPageFilter = {
  limit: 50,
  offset: 0,
  sort: "spread_desc",
  view: "all",
};

export function OpportunitiesClientNew({
  initial,
}: {
  initial: ApiResult<OpportunityListPage>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<OpportunityRow | null>(null);

  const query = useQuery({
    queryKey: queryKeys.opportunitiesPage(LIST_FILTER),
    queryFn: () => listOpportunitiesPage(LIST_FILTER),
    initialData: initial,
  });

  const result = query.data;

  if (result === undefined) {
    return <p className="text-sm text-muted-foreground">Loading opportunities…</p>;
  }

  if (!result.ok) {
    return (
      <Card>
        <CardContent className="pt-6">
          {result.kind === "unavailable" ? (
            <UnavailableState code={result.error} title="Opportunities unavailable" />
          ) : (
            <ErrorState error={result} onRetry={() => void query.refetch()} />
          )}
        </CardContent>
      </Card>
    );
  }

  const { items: rows, total } = result.data;
  const leads = rows.filter((r) => r.type === "lead").length;
  const nearMisses = rows.filter((r) => r.type === "near_miss").length;
  const manual = rows.filter((r) => r.type === "manual_submission").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ManualSubmitDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Queue summary
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
          <span>Total in queue: {total}</span>
          <span>Showing: {rows.length}</span>
          <span>Leads: {leads}</span>
          <span>Near misses: {nearMisses}</span>
          <span>Manual: {manual}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Opportunities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OpportunitiesTable
            rows={rows}
            loading={query.isLoading}
            onSelect={(row) => setSelected(row)}
            onOpenDetail={(row) => router.push(`/opportunities/${row.id}`)}
            emptyTitle="No opportunities yet"
            emptyHint="Leads, near-miss listings, and manual submissions appear here. Submit a listing link with the button above."
          />
          <p className="pt-3 text-xs text-muted-foreground">
            Sorted by spread (highest room first). Click a row for a quick preview. Double-click
            or use the preview link for the full detail page.
          </p>
        </CardContent>
      </Card>

      <OpportunityPreviewSheet row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
