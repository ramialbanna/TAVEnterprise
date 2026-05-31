"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  claimOpportunity,
  getAppMe,
  listOpportunitiesPage,
  type OpportunitiesPageFilter,
  type OpportunitySort,
  type OpportunityView,
} from "@/lib/app-api/client";
import type { ApiResult } from "@/lib/app-api";
import { codeMessage } from "@/lib/app-api";
import type { OpportunityListPage } from "@/lib/app-api/schemas";
import { PAGE_COPY } from "@/lib/copy/opportunities-labels";
import {
  countFirstSeenToday,
  DEFAULT_QUEUE_VIEW,
  emptyCopyForView,
  formatQueueSummaryLine,
} from "@/lib/opportunities/queue-views";
import { DEFAULT_PAGE_SIZE } from "@/lib/opportunities/table-preferences";
import { queryKeys } from "@/lib/query";
import { cn } from "@/lib/utils";
import { ErrorState, UnavailableState } from "@/components/data-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { OpportunitiesMobileActionBar } from "./opportunities-mobile-action-bar";
import { OpportunitiesQueueTabs } from "./opportunities-queue-tabs";
import { OpportunitiesTableNew } from "./opportunities-table-new";
import { OpportunityPreviewSheetNew } from "./opportunity-preview-sheet-new";
import { ManualSubmitDialog } from "./manual-submit-dialog";
import type { OpportunityRow } from "@/lib/app-api/schemas";

const SUMMARY_FETCH_LIMIT = 100;

function countFilter(
  filter: OpportunitiesPageFilter,
): Pick<OpportunitiesPageFilter, "limit" | "offset" | "sort" | "view"> {
  return {
    limit: 1,
    offset: 0,
    sort: filter.sort ?? "spread_desc",
    view: filter.view,
  };
}

function extractTotal(result: ApiResult<OpportunityListPage> | undefined): number | undefined {
  if (!result?.ok) return undefined;
  return result.data.total;
}

export function OpportunitiesClientNew({
  initial,
  initialView = DEFAULT_QUEUE_VIEW,
}: {
  initial: ApiResult<OpportunityListPage>;
  initialView?: OpportunityView;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<OpportunityRow | null>(null);
  const [view, setView] = useState<OpportunityView>(initialView);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [sort, setSort] = useState<OpportunitySort>("spread_desc");

  const listFilter: OpportunitiesPageFilter = {
    limit,
    offset,
    sort,
    view,
  };

  const matchesInitialFetch =
    view === initialView &&
    offset === 0 &&
    limit === DEFAULT_PAGE_SIZE &&
    sort === "spread_desc";

  const query = useQuery({
    queryKey: queryKeys.opportunitiesPage(listFilter),
    queryFn: () => listOpportunitiesPage(listFilter),
    initialData: matchesInitialFetch ? initial : undefined,
    placeholderData: (previous) => previous,
  });

  const meQuery = useQuery({
    queryKey: queryKeys.appMe,
    queryFn: getAppMe,
  });

  const summaryQueries = useQueries({
    queries: [
      {
        queryKey: queryKeys.opportunitiesPage(countFilter({ view: "needs_action" })),
        queryFn: () => listOpportunitiesPage(countFilter({ view: "needs_action" })),
        staleTime: 60_000,
      },
      {
        queryKey: queryKeys.opportunitiesPage(countFilter({ view: "mine" })),
        queryFn: () => listOpportunitiesPage(countFilter({ view: "mine" })),
        staleTime: 60_000,
      },
      {
        queryKey: queryKeys.opportunitiesPage(countFilter({ view: "worth_a_look" })),
        queryFn: () => listOpportunitiesPage(countFilter({ view: "worth_a_look" })),
        staleTime: 60_000,
      },
      {
        queryKey: ["opportunities-summary", "new-today"] as const,
        queryFn: () =>
          listOpportunitiesPage({
            limit: SUMMARY_FETCH_LIMIT,
            offset: 0,
            sort: "last_seen_desc",
            view: "all",
          }),
        staleTime: 60_000,
      },
    ],
  });

  const claimMutation = useMutation({
    mutationFn: (row: OpportunityRow) => claimOpportunity(row.id),
    onSuccess: (result, row) => {
      if (result.ok) {
        toast.success(PAGE_COPY.claimAction);
        void queryClient.invalidateQueries({ queryKey: ["opportunities-page"] });
        void queryClient.invalidateQueries({ queryKey: ["opportunities-summary"] });
        void queryClient.invalidateQueries({ queryKey: queryKeys.opportunity(row.id) });
        setSelected(result.data);
        return;
      }
      toast.error(codeMessage(result.error));
    },
  });

  const result = query.data;
  const claimActor = meQuery.data?.ok ? meQuery.data.data : null;

  const tabCounts: Partial<Record<OpportunityView, number>> = {
    needs_action: extractTotal(summaryQueries[0].data),
    mine: extractTotal(summaryQueries[1].data),
    worth_a_look: extractTotal(summaryQueries[2].data),
  };

  const needsYou = tabCounts.needs_action ?? 0;
  const newTodayResult = summaryQueries[3].data;
  const newToday =
    newTodayResult?.ok === true
      ? countFirstSeenToday(newTodayResult.data.items)
      : 0;

  const summaryLine = formatQueueSummaryLine({ needsYou, newToday });
  const emptyCopy = emptyCopyForView(view);

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

  function handleViewChange(nextView: OpportunityView) {
    setView(nextView);
    setOffset(0);
    setSelected(null);
  }

  function handlePaginationChange(nextOffset: number, nextLimit: number) {
    setOffset(nextOffset);
    setLimit(nextLimit);
  }

  function handleSortChange(nextSort: OpportunitySort) {
    setSort(nextSort);
    setOffset(0);
  }

  return (
    <div className={cn("space-y-4", selected && "pb-28 md:pb-0")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ManualSubmitDialog />
      </div>

      <Card>
        <CardHeader className="space-y-3 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {PAGE_COPY.queueSummaryTitle}
          </CardTitle>
          <p className="text-base font-medium text-foreground">{summaryLine}</p>
          <OpportunitiesQueueTabs view={view} counts={tabCounts} onViewChange={handleViewChange} />
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
            emptyTitle={emptyCopy.title}
            emptyHint={emptyCopy.hint}
          />
          <p className="pt-3 text-xs text-muted-foreground">{PAGE_COPY.tableFooter}</p>
        </CardContent>
      </Card>

      <OpportunityPreviewSheetNew row={selected} onClose={() => setSelected(null)} />

      {selected ? (
        <OpportunitiesMobileActionBar
          row={selected}
          claimActor={claimActor}
          claimPending={claimMutation.isPending}
          onClaim={() => claimMutation.mutate(selected)}
          onOpenDetail={() => router.push(`/opportunities/${selected.id}`)}
        />
      ) : null}
    </div>
  );
}
