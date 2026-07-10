"use client";

import { startTransition, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  claimOpportunity,
  dismissOpportunity,
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
import type { DismissReasonCode } from "@/lib/opportunities/dismiss-reasons";
import {
  countFirstSeenToday,
  DEFAULT_QUEUE_VIEW,
  formatQueueSummaryLine,
} from "@/lib/opportunities/queue-views";
import { DEFAULT_PAGE_SIZE } from "@/lib/opportunities/table-preferences";
import { queryKeys } from "@/lib/query";
import { cn } from "@/lib/utils";
import { ErrorState, UnavailableState } from "@/components/data-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { ClaimFeedbackInline } from "./claim-feedback-inline";
import { DismissOpportunityDialog } from "./dismiss-opportunity-dialog";
import { OpportunitiesMobileActionBar } from "./opportunities-mobile-action-bar";
import { OpportunitiesQueueTabs } from "./opportunities-queue-tabs";
import { OpportunitiesTableNew } from "./opportunities-table-new";
import { OpportunitiesTourNew } from "./opportunities-tour-new";
import { ManualSubmitDialog } from "./manual-submit-dialog";
import type { OpportunityRow } from "@/lib/app-api/schemas";

const SUMMARY_FETCH_LIMIT = 100;
/** List + tab revisit cache — NEXT_STEPS #43. */
const LIST_STALE_TIME_MS = 60_000;

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
    sort: filter.sort ?? "received_desc",
    view: filter.view,
  };
}

function extractTotal(result: ApiResult<OpportunityListPage> | undefined): number | undefined {
  if (!result?.ok) return undefined;
  return result.data.total;
}

function listPageFilter(
  view: OpportunityView,
  opts: { limit: number; offset: number; sort: OpportunitySort },
): OpportunitiesPageFilter {
  return {
    limit: opts.limit,
    offset: opts.offset,
    sort: opts.sort,
    view,
  };
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
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [sort, setSort] = useState<OpportunitySort>("received_desc");
  const [claimFeedbackRow, setClaimFeedbackRow] = useState<OpportunityRow | null>(null);
  const [dismissTarget, setDismissTarget] = useState<OpportunityRow | null>(null);

  const viewParam = searchParams.get("view");
  const viewKey = viewParam ?? "";
  const urlView: OpportunityView =
    viewParam === null ? initialView : parseViewParam(viewParam);

  // Optimistic tab selection — highlight + fetch target immediately (#52).
  // URL catches up via startTransition(router.replace) without blocking paint.
  // `pendingViewKey` ignores stale in-flight URL updates when the user clicks
  // another tab before the first replace lands (avoids snap-back).
  const [view, setView] = useState(urlView);
  const [pendingViewKey, setPendingViewKey] = useState<string | null>(null);
  const [syncedViewKey, setSyncedViewKey] = useState(viewKey);

  if (syncedViewKey !== viewKey) {
    setSyncedViewKey(viewKey);
    if (pendingViewKey !== null) {
      if (pendingViewKey === viewKey) {
        setPendingViewKey(null);
      }
      // else: stale URL from an earlier click — keep optimistic `view`
    } else if (urlView !== view) {
      // Browser back/forward or external navigation
      setView(urlView);
      setOffset(0);
      setSelected(null);
    }
  }

  const listFilter = listPageFilter(view, { limit, offset, sort });

  const matchesInitialFetch =
    view === initialView &&
    offset === 0 &&
    limit === DEFAULT_PAGE_SIZE &&
    sort === "received_desc";

  const meQuery = useQuery({
    queryKey: queryKeys.appMe,
    queryFn: getAppMe,
  });

  const viewerOpts = viewerFetchOptions(meQuery.data);
  const viewerUserId = viewerOpts?.viewerUserId ?? null;

  const query = useQuery({
    queryKey: [queryKeys.opportunitiesPage(listFilter), viewerUserId] as const,
    queryFn: () => listOpportunitiesPage(listFilter, viewerOpts),
    initialData: matchesInitialFetch ? initial : undefined,
    enabled: view !== "mine" || meQuery.isSuccess,
    staleTime: LIST_STALE_TIME_MS,
    // Keep prior tab rows visible while the next view loads (#43) — avoids
    // unmounting the queue shell (which felt like a "dead" double-click, #52).
    // Do not reuse an error page or show another view's rows under Mine before /me.
    placeholderData: (previousData) => {
      if (view === "mine" && !viewerUserId) return undefined;
      return previousData?.ok === true ? previousData : undefined;
    },
  });

  const prefetchView = useCallback(
    (nextView: OpportunityView) => {
      if (nextView === view) return;
      if (nextView === "mine" && !meQuery.isSuccess) return;
      const filter = listPageFilter(nextView, {
        limit: DEFAULT_PAGE_SIZE,
        offset: 0,
        sort,
      });
      void queryClient.prefetchQuery({
        queryKey: [queryKeys.opportunitiesPage(filter), viewerUserId] as const,
        queryFn: () => listOpportunitiesPage(filter, viewerOpts),
        staleTime: LIST_STALE_TIME_MS,
      });
    },
    [meQuery.isSuccess, queryClient, sort, view, viewerOpts, viewerUserId],
  );

  const summaryQueries = useQueries({
    queries: [
      {
        queryKey: [queryKeys.opportunitiesPage(countFilter({ view: "needs_action" })), viewerUserId] as const,
        queryFn: () => listOpportunitiesPage(countFilter({ view: "needs_action" }), viewerOpts),
        staleTime: LIST_STALE_TIME_MS,
      },
      {
        queryKey: [queryKeys.opportunitiesPage(countFilter({ view: "mine" })), viewerUserId] as const,
        queryFn: () => listOpportunitiesPage(countFilter({ view: "mine" }), viewerOpts),
        enabled: meQuery.isSuccess,
        staleTime: LIST_STALE_TIME_MS,
      },
      {
        queryKey: [queryKeys.opportunitiesPage(countFilter({ view: "worth_a_look" })), viewerUserId] as const,
        queryFn: () => listOpportunitiesPage(countFilter({ view: "worth_a_look" }), viewerOpts),
        staleTime: LIST_STALE_TIME_MS,
      },
      {
        queryKey: ["opportunities-summary", "new-today", viewerUserId] as const,
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
        staleTime: LIST_STALE_TIME_MS,
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

  const dismissMutation = useMutation({
    mutationFn: (input: { row: OpportunityRow; reason: DismissReasonCode; notes?: string }) =>
      dismissOpportunity(input.row.id, { reason: input.reason, notes: input.notes }),
    onSuccess: (result, variables) => {
      if (result.ok) {
        toast.success("Flagged as bad lead");
        setDismissTarget(null);
        if (selected?.id === variables.row.id) setSelected(null);
        void queryClient.invalidateQueries({ queryKey: ["opportunities-page"] });
        void queryClient.invalidateQueries({ queryKey: ["opportunities-summary"] });
        void queryClient.invalidateQueries({ queryKey: queryKeys.opportunity(variables.row.id) });
        return;
      }
      if (!result.ok) toast.error(codeMessage(result.error));
    },
  });

  const result = query.data;
  const showingPlaceholder = query.isPlaceholderData === true;
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

  function handleViewChange(nextView: OpportunityView) {
    if (nextView === view) return;
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
    setPendingViewKey(nextView === DEFAULT_QUEUE_VIEW ? "" : nextView);
    startTransition(() => {
      router.replace(qs ? `/opportunities?${qs}` : "/opportunities", { scroll: false });
    });
  }

  function handlePaginationChange(nextOffset: number, nextLimit: number) {
    setOffset(nextOffset);
    setLimit(nextLimit);
  }

  function handleSortChange(nextSort: OpportunitySort) {
    setSort(nextSort);
    setOffset(0);
  }

  // First paint only — never tear down tabs mid-switch (#52).
  if (result === undefined) {
    return (
      <div className="space-y-4">
        <OpportunitiesTourNew />
        <Card>
          <CardHeader className="space-y-3 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {PAGE_COPY.queueSummaryTitle}
            </CardTitle>
            <p className="text-base font-medium text-foreground">{summaryLine}</p>
            <OpportunitiesQueueTabs
              view={view}
              counts={tabCounts}
              onViewChange={handleViewChange}
              onPrefetchView={prefetchView}
            />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Loading opportunities…</p>
          </CardContent>
        </Card>
      </div>
    );
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
          <OpportunitiesQueueTabs
            view={view}
            counts={tabCounts}
            loading={query.isFetching && showingPlaceholder}
            onViewChange={handleViewChange}
            onPrefetchView={prefetchView}
          />
        </CardHeader>
        <CardContent
          className={cn(
            showingPlaceholder && query.isFetching && "opacity-70 transition-opacity",
          )}
        >
          <OpportunitiesTableNew
            rows={rows}
            total={total}
            offset={offset}
            limit={limit}
            sort={sort}
            loading={query.isFetching && !showingPlaceholder}
            selectedId={selected?.id ?? null}
            claimActor={claimActor}
            claimPendingId={claimMutation.isPending ? (claimMutation.variables?.id ?? null) : null}
            dismissPendingId={
              dismissMutation.isPending ? (dismissMutation.variables?.row.id ?? null) : null
            }
            onOpenDetail={(row) => router.push(`/opportunities/${row.id}`)}
            onPaginationChange={handlePaginationChange}
            onSortChange={handleSortChange}
            onClaim={(row) => claimMutation.mutate(row)}
            onDismiss={(row) => setDismissTarget(row)}
            queueView={view}
          />
        </CardContent>
      </Card>

      <DismissOpportunityDialog
        open={dismissTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDismissTarget(null);
        }}
        vehicleLabel={
          dismissTarget
            ? [dismissTarget.year, dismissTarget.make, dismissTarget.model]
                .filter(Boolean)
                .join(" ") || dismissTarget.title
            : null
        }
        pending={dismissMutation.isPending}
        onSubmit={({ reason, notes }) => {
          if (!dismissTarget) return;
          dismissMutation.mutate({ row: dismissTarget, reason, notes });
        }}
      />

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
