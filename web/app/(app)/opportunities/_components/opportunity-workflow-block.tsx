"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listAppUsers } from "@/lib/app-api/client";
import { formatOpportunityStatus } from "@/lib/copy/opportunities-labels";
import {
  formatClaimCountdown,
  isClaimActive,
  type WorkflowTarget,
} from "@/lib/opportunities/workflow-steps";
import { queryKeys } from "@/lib/query";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const selectClass =
  "h-9 min-w-[12rem] rounded-md border border-border bg-background px-3 text-sm text-foreground " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export type OpportunityWorkflowBlockProps = {
  opportunity: WorkflowTarget & { id: string };
  me: { id: string; displayName: string; role: string } | null;
  onAssign: (assignedToUserId: string | null) => void;
  assignPending?: boolean;
};

function collisionMessage(
  row: WorkflowTarget,
  currentUserId: string | null,
  currentUserName: string | null,
): string | null {
  if (!currentUserId) return null;

  if (row.claimedBy && isClaimActive(row.claimExpiresAt) && row.claimedBy !== currentUserName) {
    return `${row.claimedBy} is working this deal${row.claimedAt ? ` (since ${formatDateTime(row.claimedAt)})` : ""}.`;
  }

  if (row.lastEvaluatedBy && row.lastEvaluatedBy !== currentUserName && row.lastEvaluatedAt) {
    return `${row.lastEvaluatedBy} reviewed this deal at ${formatDateTime(row.lastEvaluatedAt)}.`;
  }

  return null;
}

export function OpportunityWorkflowBlock({
  opportunity,
  me,
  onAssign,
  assignPending = false,
}: OpportunityWorkflowBlockProps) {
  const usersQuery = useQuery({
    queryKey: queryKeys.appUsers,
    queryFn: listAppUsers,
    enabled: me?.role === "admin",
  });

  const claimActive = isClaimActive(opportunity.claimExpiresAt);
  const claimOwnerIsMe =
    opportunity.claimedBy === me?.displayName || opportunity.claimedBy === me?.id;
  const collision = useMemo(
    () => collisionMessage(opportunity, me?.id ?? null, me?.displayName ?? null),
    [opportunity, me?.id, me?.displayName],
  );

  const claimCountdown =
    claimOwnerIsMe && claimActive ? formatClaimCountdown(opportunity.claimExpiresAt) : null;

  const isAdmin = me?.role === "admin";

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {opportunity.status ? (
          <Badge variant="outline">{formatOpportunityStatus(opportunity.status)}</Badge>
        ) : null}
        {claimCountdown ? (
          <span className="text-sm font-medium text-foreground">{claimCountdown}</span>
        ) : null}
      </div>

      {collision ? (
        <p
          role="status"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
        >
          {collision}
        </p>
      ) : null}

      <dl className="grid gap-2 sm:grid-cols-2">
        <WorkflowRow label="Assigned closer" value={opportunity.assignedCloserName ?? "—"} />
        <WorkflowRow label="Working by" value={opportunity.claimedBy ?? "—"} />
        <WorkflowRow label="Claimed at" value={formatDateTime(opportunity.claimedAt)} />
        <WorkflowRow label="Claim expires" value={formatDateTime(opportunity.claimExpiresAt)} />
        <WorkflowRow label="Last reviewed by" value={opportunity.lastEvaluatedBy ?? "—"} />
        <WorkflowRow
          label="Last reviewed at"
          value={formatDateTime(opportunity.lastEvaluatedAt)}
        />
      </dl>

      {isAdmin ? (
        <form
          key={`${opportunity.id}:${opportunity.assignedTo ?? "none"}`}
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const nextAssignee = String(formData.get("assignee") ?? "");
            onAssign(nextAssignee ? nextAssignee : null);
          }}
        >
          <label className="sr-only" htmlFor={`assignee-${opportunity.id}`}>
            Assign closer
          </label>
          <select
            id={`assignee-${opportunity.id}`}
            name="assignee"
            className={selectClass}
            defaultValue={opportunity.assignedTo ?? ""}
            disabled={usersQuery.isLoading || assignPending}
          >
            <option value="">Unassigned</option>
            {(usersQuery.data?.ok ? usersQuery.data.data : []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName}
              </option>
            ))}
          </select>
          <Button size="sm" variant="secondary" type="submit" disabled={assignPending}>
            Save assignment
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function WorkflowRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
