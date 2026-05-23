"use client";

import type { OpportunityAction } from "@/lib/app-api/schemas";
import { formatDateTime } from "@/lib/format";

import { describeOpportunityAction } from "./workflow-helpers";

export function OpportunityActionHistory({
  actions,
  emptyMessage = "No workflow activity yet.",
}: {
  actions: OpportunityAction[];
  emptyMessage?: string;
}) {
  if (actions.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ol className="space-y-3">
      {actions.map((action) => (
        <li
          key={action.id}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{action.actorName ?? "Unknown user"}</span>
            <time className="text-xs text-muted-foreground" dateTime={action.createdAt}>
              {formatDateTime(action.createdAt)}
            </time>
          </div>
          <p className="mt-1 text-muted-foreground">{describeOpportunityAction(action)}</p>
          {action.action === "note_added" && action.notes ? (
            <p className="mt-2 whitespace-pre-wrap text-foreground">{action.notes}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
