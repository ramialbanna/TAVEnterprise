"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  addOpportunityNote,
  assignOpportunity,
  claimOpportunity,
  evaluateOpportunity,
  getAppMe,
  listAppUsers,
  updateOpportunityStatus,
} from "@/lib/app-api/client";
import type { MutatableWorkflowStatus, OpportunityAction, OpportunityRow } from "@/lib/app-api/schemas";
import { codeMessage } from "@/lib/app-api";
import { queryKeys } from "@/lib/query";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { OpportunityActionHistory } from "./opportunity-action-history";
import {
  WORKFLOW_STATUS_OPTIONS,
  canMutateWorkflow,
  formatWorkflowStatus,
} from "./workflow-helpers";

const selectClass =
  "h-9 min-w-[12rem] rounded-md border border-border bg-card px-3 text-sm text-foreground " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const textareaClass =
  "min-h-[5rem] w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

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

function invalidateOpportunityQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  opportunityId: string,
) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.opportunity(opportunityId) });
  void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
}

export function OpportunityWorkflowPanel({
  opportunity,
  actions = [],
  recordEvaluation = false,
  showActionHistory = false,
}: {
  opportunity: WorkflowTarget;
  actions?: OpportunityAction[];
  recordEvaluation?: boolean;
  showActionHistory?: boolean;
}) {
  const queryClient = useQueryClient();
  const [noteDraft, setNoteDraft] = useState("");

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
        invalidateOpportunityQueries(queryClient, opportunity.id);
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

  const claimMutation = useMutation({
    mutationFn: () => claimOpportunity(opportunity.id),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Opportunity claimed for 24 hours");
        invalidateOpportunityQueries(queryClient, opportunity.id);
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
        invalidateOpportunityQueries(queryClient, opportunity.id);
        return;
      }
      toast.error(codeMessage(result.error));
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: MutatableWorkflowStatus) =>
      updateOpportunityStatus(opportunity.id, { status }),
    onSuccess: (result, status) => {
      if (result.ok) {
        toast.success(`Status updated to ${formatWorkflowStatus(status === "purchased" ? "purchased" : status)}`);
        invalidateOpportunityQueries(queryClient, opportunity.id);
        return;
      }
      toast.error(codeMessage(result.error));
    },
  });

  const noteMutation = useMutation({
    mutationFn: (note: string) => addOpportunityNote(opportunity.id, { note }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Note added");
        setNoteDraft("");
        invalidateOpportunityQueries(queryClient, opportunity.id);
        return;
      }
      toast.error(codeMessage(result.error));
    },
  });

  const me = meQuery.data?.ok ? meQuery.data.data : null;
  const isAdmin = me?.role === "admin";
  const canClaim = me?.role === "admin" || me?.role === "closer";
  const canMutate = canMutateWorkflow(me, opportunity);
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

  const currentStatus = opportunity.status;
  const recentNotes = actions.filter((action) => action.action === "note_added").slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Assignment
          </h3>
          {currentStatus ? (
            <Badge variant="outline">{formatWorkflowStatus(currentStatus)}</Badge>
          ) : null}
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
            <form
              key={`${opportunity.id}:${opportunity.assignedTo ?? "none"}`}
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                const nextAssignee = String(formData.get("assignee") ?? "");
                assignMutation.mutate(nextAssignee ? nextAssignee : null);
              }}
            >
              <select
                name="assignee"
                className={selectClass}
                defaultValue={opportunity.assignedTo ?? ""}
                disabled={usersQuery.isLoading || assignMutation.isPending}
              >
                <option value="">Unassigned</option>
                {(usersQuery.data?.ok ? usersQuery.data.data : []).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName} ({user.role})
                  </option>
                ))}
              </select>
              <Button size="sm" variant="secondary" type="submit" disabled={assignMutation.isPending}>
                Save assignment
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {canMutate ? (
        <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Workflow
            </h3>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Update status
            </p>
            <div className="flex flex-wrap gap-2">
              {WORKFLOW_STATUS_OPTIONS.map((option) => {
                const persistedStatus =
                  option.value === "purchased" ? "purchased" : option.value;
                const isCurrent = currentStatus === persistedStatus;
                return (
                  <Button
                    key={option.value}
                    size="sm"
                    variant={isCurrent ? "default" : "outline"}
                    disabled={statusMutation.isPending || isCurrent}
                    onClick={() => statusMutation.mutate(option.value)}
                    className={cn(isCurrent && "pointer-events-none")}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor={`note-${opportunity.id}`} className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Add note
            </label>
            <textarea
              id={`note-${opportunity.id}`}
              className={textareaClass}
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              maxLength={2000}
              placeholder="Seller context, callback notes, negotiation details…"
              disabled={noteMutation.isPending}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={noteMutation.isPending || noteDraft.trim().length === 0}
                onClick={() => noteMutation.mutate(noteDraft.trim())}
              >
                Add note
              </Button>
            </div>
          </div>

          {recentNotes.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Recent notes
              </p>
              <OpportunityActionHistory actions={recentNotes} emptyMessage="" />
            </div>
          ) : null}
        </div>
      ) : null}

      {showActionHistory ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Action history
          </h3>
          <OpportunityActionHistory actions={actions} />
        </div>
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
