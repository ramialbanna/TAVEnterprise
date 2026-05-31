"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  claimOpportunity,
  getAppMe,
  listOpportunitiesPage,
  type ListOpportunitiesPageOptions,
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
  formatQueueSummaryLine,
} from "@/lib/opportunities/queue-views";
import { paginateOpportunityRowsClient } from "@/lib/opportunities/list-page";
import { filterOpportunityRowsByView } from "@/lib/opportunities/view-filter";
import { DEFAULT_PAGE_SIZE } from "@/lib/opportunities/table-preferences";
import { queryKeys } from "@/lib/query";
import { cn } from "@/lib/utils";
import { ErrorState, UnavailableState } from "@/components/data-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { ClaimFeedbackInline } from "./claim-feedback-inline";
import { OpportunitiesMobileActionBar } from "./opportunities-mobile-action-bar";
import { OpportunitiesQueueTabs } from "./opportunities-queue-tabs";
import { OpportunitiesTableNew } from "./opportunities-table-new";
import { OpportunitiesTourNew } from "./opportunities-tour-new";
import { OpportunityPreviewSheetNew } from "./opportunity-preview-sheet-new";
import { ManualSubmitDialog } from "./manual-submit-dialog";
import type { OpportunityRow } from "@/lib/app-api/schemas";

const SUMMARY_FETCH_LIMIT = 100;

const QUEUE_VIEWS = new Set<OpportunityView>(["needs_action", "mine", "worth_a_look", "all"]);

function parseViewParam(raw: string | null): OpportunityView {
  if (raw && QUEUE_VIEWS.has(raw as OpportunityView)) return raw as OpportunityView;
  return DEFAULT_QUEUE_VIEW;
}

function viewerFetchOptions(
  me: Awaited<ReturnType<typeof getAppMe>> | undefined,
): ListOpportunitiesPageOptions | undefined {
  if (!me?.ok) return undefined;
  return { viewerUserId: me.data.id, viewerDisplayName: me.data.displayName };
}

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
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<OpportunityRow | null>(null);
  const [view, setView] = useState<OpportunityView>(initialView);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [sort, setSort] = useState<OpportunitySort>("spread_desc");
  const [claimFeedbackRow, setClaimFeedbackRow] = useState<OpportunityRow | null>(null);

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

  const meQuery = useQuery({
    queryKey: queryKeys.appMe,
    queryFn: getAppMe,
  });

  const viewerOpts = viewerFetchOptions(meQuery.data);

  const query = useQuery({
    queryKey: [queryKeys.opportunitiesPage(listFilter), viewerOpts?.viewerUserId ?? null] as const,
    queryFn: () => listOpportunitiesPage(listFilter, viewerOpts),
    initialData: matchesInitialFetch ? initial : undefined,
    enabled: view !== "mine" || meQuery.isSuccess,
  });

  useEffect(() => {
    const next = parseViewParam(searchParams.get("view"));
    setView((current) => (current === next ? current : next));
    setOffset(0);
    setSelected(null);
  }, [searchParams]);

  const summaryQueries = useQueries({
    queries: [
      {
        queryKey: [queryKeys.opportunitiesPage(countFilter({ view: "needs_action" })), viewerOpts?.viewerUserId ?? null] as const,
        queryFn: () => listOpportunitiesPage(countFilter({ view: "needs_action" }), viewerOpts),
        staleTime: 60_000,
      },
      {
        queryKey: [queryKeys.opportunitiesPage(countFilter({ view: "mine" })), viewerOpts?.viewerUserId ?? null] as const,
        queryFn: () => listOpportunitiesPage(countFilter({ view: "mine" }), viewerOpts),
        enabled: meQuery.isSuccess,
        staleTime: 60_000,
      },
      {
        queryKey: [queryKeys.opportunitiesPage(countFilter({ view: "worth_a_look" })), viewerOpts?.viewerUserId ?? null] as const,
        queryFn: () => listOpportunitiesPage(countFilter({ view: "worth_a_look" }), viewerOpts),
        staleTime: 60_000,
      },
      {
        queryKey: ["opportunities-summary", "new-today", viewerOpts?.viewerUserId] as const,
        queryFn: () =>
          listOpportunitiesPage(
            {
              limit: SUMMARY_FETCH_LIMIT,
              offset: 0,
              sort: "last_seen_desc",
              view: "all",
            },
            viewerOpts,
          ),
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
        setClaimFeedbackRow(result.data);
        return;
      }
      toast.error(codeMessage(result.error));
    },
  });

  const result = query.data;
  const claimActor = meQuery.data?.ok ? meQuery.data.data : null;

  /** Always align table rows with the active tab (API count can differ from list body). */
  const displayResult = useMemo((): ApiResult<OpportunityListPage> | undefined => {
    if (!result?.ok) return result;
    if (view === "all") return result;

    const filtered = filterOpportunityRowsByView(result.data.items, view, {
      viewerUserId: viewerOpts?.viewerUserId,
      viewerDisplayName: viewerOpts?.viewerDisplayName,
    });
    const page = paginateOpportunityRowsClient(filtered, { limit, offset, sort });
    return { ok: true, status: result.status, data: page };
  }, [result, view, viewerOpts, limit, offset, sort]);

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

  const pageData = displayResult?.ok === true ? displayResult.data : result.data;
  const { items: rows, total } = pageData;

  function handleViewChange(nextView: OpportunityView) {
    setView(nextView);
    setOffset(0);
    setSelected(null);
    const params = new URLSearchParams(searchParams.toString());
    if (nextView === DEFAULT_QUEUE_VIEW) {
      params.delete("view");
    } else {
      params.set("view", nextView);
    }
    const qs = params.toString();
    router.replace(qs ? `/opportunities?${qs}` : "/opportunities", { scroll: false });
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
      <OpportunitiesTourNew />

      {claimFeedbackRow ? (
        <ClaimFeedbackInline row={claimFeedbackRow} onDismiss={() => setClaimFeedbackRow(null)} />
      ) : null}

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
            queueView={view}
          />
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
