"use client";

import { Loader2 } from "lucide-react";

import type { OpportunityView } from "@/lib/app-api/client";
import { QUEUE_VIEWS } from "@/lib/opportunities/queue-views";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function OpportunitiesQueueTabs({
  view,
  counts,
  loading = false,
  onViewChange,
  onPrefetchView,
}: {
  view: OpportunityView;
  counts?: Partial<Record<OpportunityView, number>>;
  /** True while the active tab is showing placeholder rows and refetching. */
  loading?: boolean;
  onViewChange: (view: OpportunityView) => void;
  onPrefetchView?: (view: OpportunityView) => void;
}) {
  return (
    <Tabs
      value={view}
      onValueChange={(next) => onViewChange(next as OpportunityView)}
      className="w-full"
    >
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1 sm:w-auto">
        {QUEUE_VIEWS.map(({ value, label }) => {
          const count = counts?.[value];
          const isActive = value === view;
          return (
            <TabsTrigger
              key={value}
              value={value}
              className="gap-1"
              onMouseEnter={() => onPrefetchView?.(value)}
              onFocus={() => onPrefetchView?.(value)}
            >
              {label}
              {isActive && loading ? (
                <Loader2
                  className="size-3.5 animate-spin text-muted-foreground"
                  aria-hidden
                />
              ) : count !== undefined && count > 0 ? (
                <span className="tabular-nums text-muted-foreground">({count})</span>
              ) : null}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
