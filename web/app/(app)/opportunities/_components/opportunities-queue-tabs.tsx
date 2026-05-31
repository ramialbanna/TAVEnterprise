"use client";

import type { OpportunityView } from "@/lib/app-api/client";
import { QUEUE_VIEWS } from "@/lib/opportunities/queue-views";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function OpportunitiesQueueTabs({
  view,
  counts,
  onViewChange,
}: {
  view: OpportunityView;
  counts?: Partial<Record<OpportunityView, number>>;
  onViewChange: (view: OpportunityView) => void;
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
          return (
            <TabsTrigger key={value} value={value} className="gap-1">
              {label}
              {count !== undefined && count > 0 ? (
                <span className="tabular-nums text-muted-foreground">({count})</span>
              ) : null}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
