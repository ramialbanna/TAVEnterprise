"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  assignOpportunity,
  claimOpportunity,
  evaluateOpportunity,
  getAppMe,
  patchOpportunity,
  updateOpportunityStatus,
} from "@/lib/app-api/client";
import { codeMessage } from "@/lib/app-api";
import type { MutatableWorkflowStatus, OpportunityDetail } from "@/lib/app-api/schemas";
import { PAGE_COPY } from "@/lib/copy/opportunities-labels";
import {
  getPrimaryWorkflowAction,
  getSecondaryWorkflowActions,
  isClaimActive,
  type WorkflowTarget,
} from "@/lib/opportunities/workflow-steps";
import { queryKeys } from "@/lib/query";
import { Button } from "@/components/ui/button";
import { CollapsibleBlock } from "@/components/ui/collapsible-block";

import { OpportunityDetailHero } from "./opportunity-detail-hero";
import { OpportunityWorkflowStepper } from "./opportunity-workflow-stepper";
import { OpportunityWorkflowBlock } from "./opportunity-workflow-block";
import { OpportunityVehicleBlock } from "./opportunity-vehicle-block";
import { OpportunityValuationBlock } from "./opportunity-valuation-block";
import { OpportunitySalespersonAppraisalBlock } from "./opportunity-salesperson-appraisal-block";
import { OpportunityTitleInformationBlock } from "./opportunity-title-information-block";
import { OpportunityNotesBlock } from "./opportunity-notes-block";
import { OpportunityActionHistory } from "./opportunity-action-history";
import { canMutateWorkflow } from "./workflow-helpers";

function invalidateOpportunityQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  router: ReturnType<typeof useRouter>,
  opportunityId: string,
) {
  router.refresh();
  void queryClient.invalidateQueries({ queryKey: queryKeys.opportunity(opportunityId) });
  void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
  void queryClient.invalidateQueries({ queryKey: ["opportunities-page"] });
  void queryClient.invalidateQueries({ queryKey: ["opportunities-summary"] });
}

export function OpportunityDetailClientNew({
  initial,
}: {
  initial: OpportunityDetail;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [patchRevision, setPatchRevision] = useState(0);

  const meQuery = useQuery({
    queryKey: queryKeys.appMe,
    queryFn: getAppMe,
  });

  // Silent evaluate-on-open — no UI feedback (redesign §2).
  const evaluateMutation = useMutation({
    mutationFn: () => evaluateOpportunity(initial.id),
    onSuccess: (result) => {
      if (result.ok) {
        invalidateOpportunityQueries(queryClient, router, initial.id);
      }
    },
  });

  useEffect(() => {
    if (meQuery.data?.ok) {
      evaluateMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id, meQuery.data?.ok]);

  const claimMutation = useMutation({
    mutationFn: () => claimOpportunity(initial.id),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(PAGE_COPY.claimAction);
        invalidateOpportunityQueries(queryClient, router, initial.id);
        return;
      }
      toast.error(codeMessage(result.error));
    },
  });

  const assignMutation = useMutation({
    mutationFn: (assignedToUserId: string | null) =>
      assignOpportunity(initial.id, { assignedToUserId }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Assignment updated");
        invalidateOpportunityQueries(queryClient, router, initial.id);
        return;
      }
      toast.error(codeMessage(result.error));
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: MutatableWorkflowStatus) =>
      updateOpportunityStatus(initial.id, { status }),
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
        invalidateOpportunityQueries(queryClient, router, initial.id);
        return;
      }
      toast.error(codeMessage(result.error));
    },
  });

  const patchMutation = useMutation({
    mutationFn: (body: Parameters<typeof patchOpportunity>[1]) =>
      patchOpportunity(initial.id, body),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Saved");
        setPatchRevision((revision) => revision + 1);
        invalidateOpportunityQueries(queryClient, router, initial.id);
        return;
      }
      toast.error(codeMessage(result.error));
    },
  });

  const patchError = patchMutation.isError
    ? "Save failed — please try again."
    : patchMutation.data && !patchMutation.data.ok
      ? codeMessage(patchMutation.data.error)
      : null;

  const me = meQuery.data?.ok ? meQuery.data.data : null;
  const canClaim = me?.role === "admin" || me?.role === "closer";
  const canMutate = canMutateWorkflow(me, initial);
  const claimActive = isClaimActive(initial.claimExpiresAt);
  const claimOwnerIsMe =
    initial.claimedBy === me?.displayName || initial.claimedBy === me?.id;

  // Collision detection reused from the workflow block logic.
  const collision = useMemo(() => {
    if (!me) return null;
    if (
      initial.claimedBy &&
      claimActive &&
      initial.claimedBy !== me.displayName &&
      initial.claimedBy !== me.id
    ) {
      return `${initial.claimedBy} is working this deal.`;
    }
    return null;
  }, [me, initial.claimedBy, claimActive]);

  const hasCollision = collision !== null;

  const primaryAction = getPrimaryWorkflowAction({
    opportunity: initial,
    canClaim,
    canMutate,
    claimActive,
    claimOwnerIsMe,
    hasCollision,
  });

  const secondaryActions = getSecondaryWorkflowActions({
    opportunity: initial,
    canMutate,
    hasCollision,
  });

  const pending =
    claimMutation.isPending ||
    statusMutation.isPending ||
    assignMutation.isPending ||
    patchMutation.isPending;

  function runPrimaryAction() {
    if (primaryAction.kind === "claim") {
      claimMutation.mutate();
      return;
    }
    if (primaryAction.kind === "status") {
      statusMutation.mutate(primaryAction.status);
    }
  }

  const heroPrimaryAction = useMemo(() => {
    if (primaryAction.kind === "none") return null;
    return (
      <Button size="sm" onClick={runPrimaryAction} disabled={pending}>
        {primaryAction.label}
      </Button>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryAction, pending]);

  const heroSecondaryActions = useMemo(
    () =>
      secondaryActions.map((action) => (
        <Button
          key={action.status}
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => statusMutation.mutate(action.status)}
        >
          {action.label}
        </Button>
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [secondaryActions, pending],
  );

  return (
    <div className="space-y-4">
      <OpportunityDetailHero
        opportunity={initial}
        contactBlockKey={`contact-${patchRevision}`}
        primaryAction={heroPrimaryAction}
        secondaryActions={heroSecondaryActions}
        onSaveContact={(patch) => patchMutation.mutate(patch)}
        patchPending={patchMutation.isPending}
        canMutate={canMutate}
        patchError={patchError}
      />

      <CollapsibleBlock
        title="Salesperson / Appraisal Information"
        description="Salesperson and appraiser"
      >
        <OpportunitySalespersonAppraisalBlock
          key={`salesperson-${patchRevision}`}
          opportunity={initial}
          onSave={(patch) => patchMutation.mutate(patch)}
          pending={patchMutation.isPending}
          canMutate={canMutate}
          error={patchError}
        />
      </CollapsibleBlock>

      <CollapsibleBlock title="Vehicle" description="Identity fields">
        <OpportunityVehicleBlock
          key={`vehicle-${patchRevision}`}
          opportunity={initial}
          onSave={(patch) => patchMutation.mutate(patch)}
          pending={patchMutation.isPending}
          canMutate={canMutate}
          error={patchError}
        />
      </CollapsibleBlock>

      <CollapsibleBlock title="Valuation" description="MMR + Max buy summary">
        <OpportunityValuationBlock key={initial.id} opportunity={initial} />
      </CollapsibleBlock>

      <CollapsibleBlock title="Title Information" description="Title, lien, and tag details">
        <OpportunityTitleInformationBlock
          key={`title-${patchRevision}`}
          opportunity={initial}
          onSave={(patch) => patchMutation.mutate(patch)}
          pending={patchMutation.isPending}
          canMutate={canMutate}
          error={patchError}
        />
      </CollapsibleBlock>

      <CollapsibleBlock title="Notes" description="Closer-added context">
        <OpportunityNotesBlock
          opportunityId={initial.id}
          actions={initial.actions}
          canMutate={canMutate}
        />
      </CollapsibleBlock>

      <CollapsibleBlock title="Workflow" description="Stepper, assignment, claim">
        <div className="space-y-4">
          <OpportunityWorkflowStepper opportunity={initial} />
          <OpportunityWorkflowBlock
            opportunity={initial as WorkflowTarget & { id: string }}
            me={
              me
                ? { id: me.id, displayName: me.displayName, role: me.role }
                : null
            }
            onAssign={(userId) => assignMutation.mutate(userId)}
            assignPending={assignMutation.isPending}
          />
        </div>
      </CollapsibleBlock>

      <CollapsibleBlock title="History" description="Full audit trail" defaultOpen={false}>
        <OpportunityActionHistory actions={initial.actions} />
      </CollapsibleBlock>
    </div>
  );
}
