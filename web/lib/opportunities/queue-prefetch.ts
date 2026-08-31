import type { QueryClient } from "@tanstack/react-query";

import type { ApiResult } from "@/lib/app-api";
import {
  getAppMe,
  listOpportunitiesPage,
  type ListOpportunitiesPageOptions,
  type OpportunitiesPageFilter,
  type OpportunitySort,
  type OpportunityView,
} from "@/lib/app-api/client";
import type { AppUser } from "@/lib/app-api/schemas";
import { queryKeys } from "@/lib/query";

import { DEFAULT_QUEUE_VIEW } from "./queue-views";
import { DEFAULT_PAGE_SIZE } from "./table-preferences";

/** List + tab revisit cache — NEXT_STEPS #43 / #58. */
export const QUEUE_LIST_STALE_TIME_MS = 60_000;

const QUEUE_VIEWS = new Set<OpportunityView>([
  "needs_action",
  "mine",
  "worth_a_look",
  "scraper_review",
  "flagged_leads",
  "all",
]);

export function queueListFilter(
  view: OpportunityView,
  opts?: { limit?: number; offset?: number; sort?: OpportunitySort },
): OpportunitiesPageFilter {
  return {
    limit: opts?.limit ?? DEFAULT_PAGE_SIZE,
    offset: opts?.offset ?? 0,
    sort: opts?.sort ?? "received_desc",
    view,
  };
}

export function queueCountFilter(view: OpportunityView): OpportunitiesPageFilter {
  return { limit: 1, offset: 0, sort: "received_desc", view };
}

export function viewerFetchOptions(
  me: ApiResult<AppUser> | undefined,
): ListOpportunitiesPageOptions | undefined {
  if (!me?.ok) return undefined;
  return { viewerUserId: me.data.id, viewerDisplayName: me.data.displayName };
}

function cachedMe(queryClient: QueryClient, me?: ApiResult<AppUser>): ApiResult<AppUser> | undefined {
  return me ?? queryClient.getQueryData<ApiResult<AppUser>>(queryKeys.appMe);
}

function prefetchMe(queryClient: QueryClient): void {
  void queryClient.prefetchQuery({
    queryKey: queryKeys.appMe,
    queryFn: getAppMe,
    staleTime: QUEUE_LIST_STALE_TIME_MS,
  });
}

function prefetchPage(
  queryClient: QueryClient,
  filter: OpportunitiesPageFilter,
  me: ApiResult<AppUser> | undefined,
): void {
  const viewerOpts = viewerFetchOptions(me);
  const viewerUserId = viewerOpts?.viewerUserId ?? null;
  if (filter.view === "mine" && !viewerUserId) return;

  void queryClient.prefetchQuery({
    queryKey: queryKeys.opportunitiesPage(filter, viewerUserId),
    queryFn: () => listOpportunitiesPage(filter, viewerOpts),
    staleTime: QUEUE_LIST_STALE_TIME_MS,
  });
}

/** Warm the default Opportunities table so Home → queue is a cache hit. */
export function prefetchOpportunitiesQueue(
  queryClient: QueryClient,
  opts?: { view?: OpportunityView; me?: ApiResult<AppUser> },
): void {
  prefetchMe(queryClient);
  const view = opts?.view ?? DEFAULT_QUEUE_VIEW;
  prefetchPage(queryClient, queueListFilter(view), cachedMe(queryClient, opts?.me));
}

/** Warm Home tile counts so Opportunities → Home does not wait on SQL. */
export function prefetchHomeCounts(
  queryClient: QueryClient,
  opts?: { me?: ApiResult<AppUser> },
): void {
  prefetchMe(queryClient);
  const me = cachedMe(queryClient, opts?.me);
  prefetchPage(queryClient, queueCountFilter("needs_action"), me);
  prefetchPage(queryClient, queueCountFilter("mine"), me);
}

function parseViewFromHref(href: string): OpportunityView {
  const qs = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
  const view = new URLSearchParams(qs).get("view");
  if (view && QUEUE_VIEWS.has(view as OpportunityView)) return view as OpportunityView;
  return DEFAULT_QUEUE_VIEW;
}

/** Sidebar / tile hover — start the destination query before the click. */
export function prefetchNavHref(
  queryClient: QueryClient,
  href: string,
  me?: ApiResult<AppUser>,
): void {
  if (href === "/dashboard" || href.startsWith("/dashboard?")) {
    prefetchHomeCounts(queryClient, { me });
    return;
  }
  if (href === "/my-work") {
    prefetchOpportunitiesQueue(queryClient, { view: "mine", me });
    return;
  }
  if (href === "/opportunities" || href.startsWith("/opportunities?")) {
    prefetchOpportunitiesQueue(queryClient, { view: parseViewFromHref(href), me });
  }
}
