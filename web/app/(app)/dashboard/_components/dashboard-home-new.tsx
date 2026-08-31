"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Briefcase, PlusCircle, Search, Target } from "lucide-react";

import { getAppMe, listOpportunitiesPage } from "@/lib/app-api/client";
import { NEW_ANALYTICS_HREF } from "@/lib/app-shell/nav-new";
import { prefetchNavHref } from "@/lib/app-shell/nav-prefetch";
import {
  prefetchOpportunitiesQueue,
  queueCountFilter,
  QUEUE_LIST_STALE_TIME_MS,
  viewerFetchOptions,
} from "@/lib/opportunities/queue-prefetch";
import { queryKeys } from "@/lib/query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type HomeCounts = {
  needsYou?: number;
  mine?: number;
};

export function DashboardHomeNew({ initialCounts = {} }: { initialCounts?: HomeCounts }) {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: queryKeys.appMe,
    queryFn: getAppMe,
    staleTime: QUEUE_LIST_STALE_TIME_MS,
  });
  const viewerOpts = viewerFetchOptions(meQuery.data);
  const viewerUserId = viewerOpts?.viewerUserId ?? null;
  const meReady = !meQuery.isPending;

  const needsFilter = queueCountFilter("needs_action");
  const mineFilter = queueCountFilter("mine");

  const needsQuery = useQuery({
    queryKey: queryKeys.opportunitiesPage(needsFilter, viewerUserId),
    queryFn: () => listOpportunitiesPage(needsFilter, viewerOpts),
    staleTime: QUEUE_LIST_STALE_TIME_MS,
    enabled: meReady,
  });
  const mineQuery = useQuery({
    queryKey: queryKeys.opportunitiesPage(mineFilter, viewerUserId),
    queryFn: () => listOpportunitiesPage(mineFilter, viewerOpts),
    staleTime: QUEUE_LIST_STALE_TIME_MS,
    enabled: meReady && meQuery.isSuccess,
  });

  useEffect(() => {
    prefetchOpportunitiesQueue(queryClient, { me: meQuery.data });
  }, [meQuery.data, queryClient]);

  const needsYou =
    needsQuery.data?.ok === true
      ? needsQuery.data.data.total
      : initialCounts.needsYou;
  const mineCount =
    mineQuery.data?.ok === true ? mineQuery.data.data.total : initialCounts.mine;

  const dealsLabel =
    needsYou === undefined
      ? "Checking your queue…"
      : needsYou > 0
        ? `${needsYou} deal${needsYou === 1 ? "" : "s"} need you`
        : "You're all caught up";

  const mineLabel =
    mineCount === undefined
      ? "Loading your assignments…"
      : mineCount > 0
        ? `${mineCount} in your queue`
        : "Nothing assigned yet";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="text-sm text-muted-foreground">
          Start with deals that need you, submit a listing, or review your queue.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/opportunities?view=needs_action"
          className="block h-full"
          onPointerEnter={() =>
            prefetchNavHref(queryClient, "/opportunities?view=needs_action", meQuery.data)
          }
        >
          <Card className="h-full transition-colors hover:bg-accent/40">
            <CardHeader>
              <Target className="mb-1 size-5 text-primary" aria-hidden />
              <CardTitle className="text-lg">{dealsLabel}</CardTitle>
              <CardDescription>Open the queue filtered to what needs action.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link
          href="/opportunities/submit"
          className="block h-full"
          onPointerEnter={() => prefetchNavHref(queryClient, "/opportunities/submit", meQuery.data)}
        >
          <Card className="h-full transition-colors hover:bg-accent/40">
            <CardHeader>
              <PlusCircle className="mb-1 size-5 text-primary" aria-hidden />
              <CardTitle className="text-lg">Submit a listing</CardTitle>
              <CardDescription>Paste a marketplace URL to add a deal to the queue.</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link
          href="/my-work"
          className="block h-full"
          onPointerEnter={() => prefetchNavHref(queryClient, "/my-work", meQuery.data)}
        >
          <Card className="h-full transition-colors hover:bg-accent/40">
            <CardHeader>
              <Briefcase className="mb-1 size-5 text-primary" aria-hidden />
              <CardTitle className="text-lg">My work</CardTitle>
              <CardDescription>{mineLabel}</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link
          href="/mmr-lab"
          className="block h-full"
          onPointerEnter={() => prefetchNavHref(queryClient, "/mmr-lab", meQuery.data)}
        >
          <Card className="h-full transition-colors hover:bg-accent/40">
            <CardHeader>
              <Search className="mb-1 size-5 text-primary" aria-hidden />
              <CardTitle className="text-lg">TAV MMR</CardTitle>
              <CardDescription>
                Wholesale MMR lookup, Max buy evaluation, and market context at the lane.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <BarChart3 className="size-5 text-muted-foreground" aria-hidden />
          <div>
            <CardTitle className="text-base">Analytics</CardTitle>
            <CardDescription>KPIs, regional outcomes, and recent sales history.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Link
            href={NEW_ANALYTICS_HREF}
            className="text-sm font-medium text-primary hover:underline"
            onPointerEnter={() => prefetchNavHref(queryClient, NEW_ANALYTICS_HREF, meQuery.data)}
          >
            View analytics →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
