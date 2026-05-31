import Link from "next/link";
import { Inbox, PlusCircle } from "lucide-react";

import type { QueueEmptyStateNew } from "@/lib/opportunities/empty-state-new";
import { EmptyState } from "@/components/data-state";
import { Button } from "@/components/ui/button";

export function OpportunitiesEmptyStateNew({ state }: { state: QueueEmptyStateNew }) {
  return (
    <EmptyState
      title={state.title}
      hint={
        <span className="block space-y-2">
          <span>{state.hint}</span>
          {state.exampleUrl ? (
            <span className="block text-[11px] text-muted-foreground/90">
              Example URL format:{" "}
              <code className="rounded bg-muted px-1 py-0.5">{state.exampleUrl}</code>
            </span>
          ) : null}
        </span>
      }
      icon={state.action?.href.includes("submit") ? PlusCircle : Inbox}
      action={
        state.action ? (
          <Button size="sm" variant="default" asChild>
            <Link href={state.action.href}>{state.action.label}</Link>
          </Button>
        ) : null
      }
    />
  );
}
