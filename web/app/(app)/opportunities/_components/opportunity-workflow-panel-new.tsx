"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check } from "lucide-react";

import {
  addOpportunityNote,
  assignOpportunity,
  claimOpportunity,
  evaluateOpportunity,
  getAppMe,
  listAppUsers,
  updateOpportunityStatus,
} from "@/lib/app-api/client";
import type { MutatableWorkflowStatus, OpportunityAction } from "@/lib/app-api/schemas";
import { codeMessage } from "@/lib/app-api";
import { formatOpportunityStatus, PAGE_COPY } from "@/lib/copy/opportunities-labels";
import {
  formatClaimCountdown,
  getPrimaryWorkflowAction,
  getSecondaryWorkflowActions,
  isClaimActive,
  resolveWorkflowStep,
  WORKFLOW_STEPS,
  workflowStepIndex,
  type WorkflowTarget,
} from "@/lib/opportunities/workflow-steps";
import { queryKeys } from "@/lib/query";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { OpportunityActionHistory } from "./opportunity-action-history";
import { canMutateWorkflow } from "./workflow-helpers";

const selectClass =
  "h-9 min-w-[12rem] rounded-md border border-border bg-card px-3 text-sm text-foreground " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const textareaClass =
  "min-h-[5rem] w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type PanelTarget = WorkflowTarget & { id: string };

function collisionMessage(
  row: PanelTarget,
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

function invalidateOpportunityQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  opportunityId: string,
) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.opportunity(opportunityId) });
  void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
  void queryClient.invalidateQueries({ queryKey: ["opportunities-page"] });
  void queryClient.invalidateQueries({ queryKey: ["opportunities-summary"] });
}

export function OpportunityWorkflowPanelNew({
  opportunity,
  actions = [],
  recordEvaluation = false,
}: {
  opportunity: PanelTarget;
  actions?: OpportunityAction[];
  recordEvaluation?: boolean;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordEvaluation, opportunity.id, meQuery.data?.ok]);

  const claimMutation = useMutation({
    mutationFn: () => claimOpportunity(opportunity.id),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(PAGE_COPY.claimAction);
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
        const label =
          status === "purchased"
            ? "Bought"
            : status === "passed"
              ? "Passed"
              : status === "contacted"
                ? "Contacted"
                : "Updated";
        toast.success(`Marked ${label.toLowerCase()}`);
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
  const claimOwnerIsMe =
    opportunity.claimedBy === me?.displayName || opportunity.claimedBy === me?.id;
  const collision = useMemo(
    () => collisionMessage(opportunity, me?.id ?? null, me?.displayName ?? null),
    [opportunity, me?.id, me?.displayName],
  );

  const currentStep = resolveWorkflowStep(opportunity);
  const currentStepIndex = workflowStepIndex(currentStep);
  const claimCountdown =
    claimOwnerIsMe && claimActive ? formatClaimCountdown(opportunity.claimExpiresAt) : null;

  const primaryAction = getPrimaryWorkflowAction({
    opportunity,
    canClaim,
    canMutate,
    claimActive,
    claimOwnerIsMe,
    hasCollision: collision !== null,
  });

  const secondaryActions = getSecondaryWorkflowActions({
    opportunity,
    canMutate,
    hasCollision: collision !== null,
  });

  const pending =
    claimMutation.isPending || statusMutation.isPending || assignMutation.isPending;

  const recentNotes = actions.filter((action) => action.action === "note_added").slice(0, 3);

  function runPrimaryAction() {
    if (primaryAction.kind === "claim") {
      claimMutation.mutate();
      return;
    }
    if (primaryAction.kind === "status") {
      statusMutation.mutate(primaryAction.status);
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground">Deal progress</h3>
          {opportunity.status ? (
            <Badge variant="outline">{formatOpportunityStatus(opportunity.status)}</Badge>
          ) : null}
        </div>

        <ol className="flex flex-wrap gap-1" aria-label="Deal progress steps">
          {WORKFLOW_STEPS.map((step, index) => {
            const complete = index < currentStepIndex;
            const current = index === currentStepIndex;
            return (
              <li
                key={step.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                  complete && "border-primary/30 bg-primary/10 text-primary",
                  current && "border-primary bg-primary text-primary-foreground",
                  !complete && !current && "border-border text-muted-foreground",
                )}
              >
                {complete ? <Check className="size-3" aria-hidden /> : null}
                {step.label}
              </li>
            );
          })}
        </ol>

        {claimCountdown ? (
          <p className="text-sm font-medium text-foreground">{claimCountdown}</p>
        ) : null}

        {collision ? (
          <p
            role="status"
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
          >
            {collision}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {primaryAction.kind === "claim" ? (
            <Button size="sm" onClick={runPrimaryAction} disabled={pending}>
              {primaryAction.label}
            </Button>
          ) : null}
          {primaryAction.kind === "status" ? (
            <Button size="sm" onClick={runPrimaryAction} disabled={pending}>
              {primaryAction.label}
            </Button>
          ) : null}
          {secondaryActions.map((action) => (
            <Button
              key={action.status}
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => statusMutation.mutate(action.status)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </section>

      {canMutate ? (
        <section className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <h3 className="text-sm font-medium text-foreground">Add a note</h3>
          <textarea
            id={`note-new-${opportunity.id}`}
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
              variant="secondary"
              disabled={noteMutation.isPending || noteDraft.trim().length === 0}
              onClick={() => noteMutation.mutate(noteDraft.trim())}
            >
              Save note
            </Button>
          </div>
          {recentNotes.length > 0 ? (
            <OpportunityActionHistory actions={recentNotes} emptyMessage="" />
          ) : null}
        </section>
      ) : null}

      <details className="group rounded-lg border border-border bg-muted/20">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            Details
            <span className="text-xs font-normal text-muted-foreground group-open:hidden">
              — assignment, claim, history
            </span>
          </span>
        </summary>
        <div className="space-y-4 border-t border-border px-4 pb-4 pt-3 text-sm">
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
                assignMutation.mutate(nextAssignee ? nextAssignee : null);
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
                disabled={usersQuery.isLoading || assignMutation.isPending}
              >
                <option value="">Unassigned</option>
                {(usersQuery.data?.ok ? usersQuery.data.data : []).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="secondary" type="submit" disabled={assignMutation.isPending}>
                Save assignment
              </Button>
            </form>
          ) : null}

          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">History</h4>
            <OpportunityActionHistory actions={actions} />
          </div>
        </div>
      </details>
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
