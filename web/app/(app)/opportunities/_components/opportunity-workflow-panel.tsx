"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  assignOpportunity,
  claimOpportunity,
  evaluateOpportunity,
  getAppMe,
  listAppUsers,
} from "@/lib/app-api/client";
import type { OpportunityDetail, OpportunityRow } from "@/lib/app-api/schemas";
import { codeMessage } from "@/lib/app-api";
import { queryKeys } from "@/lib/query";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const selectClass =
  "h-9 min-w-[12rem] rounded-md border border-border bg-card px-3 text-sm text-foreground " +
  "disabled:cursor-not-allowed disabled:opacity-50";

type WorkflowTarget = Pick<
  OpportunityRow,
  | "id"
  | "assignedTo"
  | "assignedCloserName"
  | "claimedBy"
  | "claimedAt"
  | "claimExpiresAt"
  | "lastEvaluatedBy"
  | "lastEvaluatedAt"
  | "status"
>;

function isClaimActive(claimExpiresAt: string | null): boolean {
  if (!claimExpiresAt) return false;
  return new Date(claimExpiresAt).getTime() > Date.now();
}

function collisionMessage(
  row: WorkflowTarget,
  currentUserId: string | null,
  currentUserName: string | null,
): string | null {
  if (!currentUserId) return null;

  if (row.claimedBy && isClaimActive(row.claimExpiresAt) && row.claimedBy !== currentUserName) {
    return `${row.claimedBy} claimed this opportunity${row.claimedAt ? ` at ${formatDateTime(row.claimedAt)}` : ""}.`;
  }

  if (
    row.lastEvaluatedBy &&
    row.lastEvaluatedBy !== currentUserName &&
    row.lastEvaluatedAt
  ) {
    return `${row.lastEvaluatedBy} evaluated this opportunity at ${formatDateTime(row.lastEvaluatedAt)}.`;
  }

  return null;
}

export function OpportunityWorkflowPanel({
  opportunity,
  recordEvaluation = false,
}: {
  opportunity: WorkflowTarget;
  recordEvaluation?: boolean;
}) {
  const queryClient = useQueryClient();
  const [assigneeId, setAssigneeId] = useState(opportunity.assignedTo ?? "");

  const meQuery = useQuery({
    queryKey: queryKeys.appMe,
    queryFn: getAppMe,
  });

  const usersQuery = useQuery({
    queryKey: queryKeys.appUsers,
    queryFn: listAppUsers,
    enabled: meQuery.data?.ok === true && meQuery.data.data.role === "admin",
  });

  const evaluateMutation = useMutation({
    mutationFn: () => evaluateOpportunity(opportunity.id),
    onSuccess: (result) => {
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.opportunity(opportunity.id) });
        void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      }
    },
  });

  useEffect(() => {
    if (recordEvaluation && meQuery.data?.ok) {
      evaluateMutation.mutate();
    }
    // Record once when the panel mounts for an authenticated viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordEvaluation, opportunity.id, meQuery.data?.ok]);

  useEffect(() => {
    setAssigneeId(opportunity.assignedTo ?? "");
  }, [opportunity.assignedTo, opportunity.id]);

  const claimMutation = useMutation({
    mutationFn: () => claimOpportunity(opportunity.id),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Opportunity claimed for 24 hours");
        void queryClient.invalidateQueries({ queryKey: queryKeys.opportunity(opportunity.id) });
        void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
        return;
      }
      toast.error(codeMessage(result.error));
    },
  });

  const assignMutation = useMutation({
    mutationFn: (assignedToUserId: string | null) =>
      assignOpportunity(opportunity.id, { assignedToUserId }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Assignment updated");
        void queryClient.invalidateQueries({ queryKey: queryKeys.opportunity(opportunity.id) });
        void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
        return;
      }
      toast.error(codeMessage(result.error));
    },
  });

  const me = meQuery.data?.ok ? meQuery.data.data : null;
  const isAdmin = me?.role === "admin";
  const canClaim = me?.role === "admin" || me?.role === "closer";
  const claimActive = isClaimActive(opportunity.claimExpiresAt);
  const collision = useMemo(
    () => collisionMessage(opportunity, me?.id ?? null, me?.displayName ?? null),
    [opportunity, me?.id, me?.displayName],
  );

  const showClaim =
    canClaim &&
    (!claimActive ||
      opportunity.claimedBy === me?.displayName ||
      opportunity.claimedBy === me?.id);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Assignment
        </h3>
        {opportunity.status ? <Badge variant="outline">{opportunity.status}</Badge> : null}
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <WorkflowRow label="Assigned closer" value={opportunity.assignedCloserName ?? "—"} />
        <WorkflowRow label="Claim owner" value={opportunity.claimedBy ?? "—"} />
        <WorkflowRow label="Claimed at" value={formatDateTime(opportunity.claimedAt)} />
        <WorkflowRow label="Claim expires" value={formatDateTime(opportunity.claimExpiresAt)} />
        <WorkflowRow label="Last evaluated by" value={opportunity.lastEvaluatedBy ?? "—"} />
        <WorkflowRow label="Last evaluated at" value={formatDateTime(opportunity.lastEvaluatedAt)} />
      </dl>

      {collision ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          {collision}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {showClaim ? (
          <Button
            size="sm"
            onClick={() => claimMutation.mutate()}
            disabled={claimMutation.isPending}
          >
            {claimActive && opportunity.claimedBy === me?.displayName
              ? "Renew 24h claim"
              : "Claim opportunity"}
          </Button>
        ) : null}

        {isAdmin ? (
          <>
            <select
              className={selectClass}
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={usersQuery.isLoading || assignMutation.isPending}
            >
              <option value="">Unassigned</option>
              {(usersQuery.data?.ok ? usersQuery.data.data : []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName} ({user.role})
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              disabled={assignMutation.isPending}
              onClick={() =>
                assignMutation.mutate(assigneeId ? assigneeId : null)
              }
            >
              {assigneeId ? "Assign closer" : "Unassign"}
            </Button>
          </>
        ) : null}
      </div>
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
