"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  claimOpportunity,
  getAppMe,
  listOpportunitiesPage,
  type OpportunitiesPageFilter,
  type OpportunitySort,
} from "@/lib/app-api/client";
import type { ApiResult } from "@/lib/app-api";
import { codeMessage } from "@/lib/app-api";
import type { OpportunityListPage } from "@/lib/app-api/schemas";
import { PAGE_COPY } from "@/lib/copy/opportunities-labels";
import { DEFAULT_PAGE_SIZE } from "@/lib/opportunities/table-preferences";
import { queryKeys } from "@/lib/query";
import { ErrorState, UnavailableState } from "@/components/data-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { OpportunitiesTableNew } from "./opportunities-table-new";
import { OpportunityPreviewSheetNew } from "./opportunity-preview-sheet-new";
import { ManualSubmitDialog } from "./manual-submit-dialog";
import type { OpportunityRow } from "@/lib/app-api/schemas";

export function OpportunitiesClientNew({
  initial,
}: {
  initial: ApiResult<OpportunityListPage>;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<OpportunityRow | null>(null);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [sort, setSort] = useState<OpportunitySort>("spread_desc");

  const listFilter: OpportunitiesPageFilter = {
    limit,
    offset,
    sort,
    view: "all",
  };

  const query = useQuery({
    queryKey: queryKeys.opportunitiesPage(listFilter),
    queryFn: () => listOpportunitiesPage(listFilter),
    initialData: offset === 0 && limit === DEFAULT_PAGE_SIZE && sort === "spread_desc" ? initial : undefined,
    placeholderData: (previous) => previous,
  });

  const meQuery = useQuery({
    queryKey: queryKeys.appMe,
    queryFn: getAppMe,
  });

  const claimMutation = useMutation({
    mutationFn: (row: OpportunityRow) => claimOpportunity(row.id),
    onSuccess: (result, row) => {
      if (result.ok) {
        toast.success(PAGE_COPY.claimAction);
        void queryClient.invalidateQueries({ queryKey: ["opportunities-page"] });
        void queryClient.invalidateQueries({ queryKey: queryKeys.opportunity(row.id) });
        setSelected(result.data);
        return;
      }
      toast.error(codeMessage(result.error));
    },
  });

  const result = query.data;
  const claimActor = meQuery.data?.ok ? meQuery.data.data : null;

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

  function handlePaginationChange(nextOffset: number, nextLimit: number) {
    setOffset(nextOffset);
    setLimit(nextLimit);
  }

  function handleSortChange(nextSort: OpportunitySort) {
    setSort(nextSort);
    setOffset(0);
  }

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
            total={total}
            offset={offset}
            limit={limit}
            sort={sort}
            loading={query.isFetching}
            selectedId={selected?.id ?? null}
            claimActor={claimActor}
            claimPendingId={claimMutation.isPending ? (claimMutation.variables?.id ?? null) : null}
            onSelect={(row) => setSelected(row)}
            onOpenDetail={(row) => router.push(`/opportunities/${row.id}`)}
            onPaginationChange={handlePaginationChange}
            onSortChange={handleSortChange}
            onClaim={(row) => claimMutation.mutate(row)}
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
