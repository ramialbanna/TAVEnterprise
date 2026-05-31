"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { listOpportunitiesPage, type OpportunitiesPageFilter } from "@/lib/app-api/client";
import type { ApiResult } from "@/lib/app-api";
import type { OpportunityListPage } from "@/lib/app-api/schemas";
import { PAGE_COPY } from "@/lib/copy/opportunities-labels";
import { queryKeys } from "@/lib/query";
import { ErrorState, UnavailableState } from "@/components/data-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { OpportunitiesTableNew } from "./opportunities-table-new";
import { OpportunityPreviewSheetNew } from "./opportunity-preview-sheet-new";
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
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {PAGE_COPY.queueSummaryTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
          <span>
            {PAGE_COPY.queueTotal}: {total}
          </span>
          <span>
            {PAGE_COPY.queueShowing}: {rows.length}
          </span>
          <span>
            {PAGE_COPY.queueLeads}: {leads}
          </span>
          <span>
            {PAGE_COPY.queueNearMisses}: {nearMisses}
          </span>
          <span>
            {PAGE_COPY.queueManual}: {manual}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {PAGE_COPY.tableTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OpportunitiesTableNew
            rows={rows}
            loading={query.isLoading}
            onSelect={(row) => setSelected(row)}
            onOpenDetail={(row) => router.push(`/opportunities/${row.id}`)}
            emptyTitle={PAGE_COPY.emptyTitle}
            emptyHint={PAGE_COPY.emptyHint}
          />
          <p className="pt-3 text-xs text-muted-foreground">{PAGE_COPY.tableFooter}</p>
        </CardContent>
      </Card>

      <OpportunityPreviewSheetNew row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
