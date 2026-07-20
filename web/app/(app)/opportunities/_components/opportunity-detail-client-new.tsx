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
import { codeMessage, type ApiResult } from "@/lib/app-api";
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

import { OpportunityClaimBanner, resolveClaimBannerState } from "./opportunity-claim-banner";
import { OpportunityContactInfoBlock } from "./opportunity-contact-info-block";
import { OpportunityDetailHero } from "./opportunity-detail-hero";
import { OpportunityWorkflowStepper, resolveDetailStep } from "./opportunity-workflow-stepper";
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
  // Keep a client copy so PATCH/claim/status responses update the form immediately.
  // Remounting editable blocks with stale `initial` (before router.refresh) was
  // clearing fields like VIN after save (NEXT_STEPS #49).
  // Sync from props during render (not in an effect) when router.refresh delivers
  // a new `initial` — avoids react-hooks/set-state-in-effect.
  const [syncedInitial, setSyncedInitial] = useState(initial);
  const [opportunity, setOpportunity] = useState(initial);
  const [patchRevision, setPatchRevision] = useState(0);

  if (initial !== syncedInitial) {
    setSyncedInitial(initial);
    setOpportunity(initial);
  }

  function applyDetailResult(result: ApiResult<OpportunityDetail>, opts?: { bumpForms?: boolean }) {
    if (!result.ok) return false;
    setOpportunity(result.data);
    if (opts?.bumpForms !== false) {
      setPatchRevision((revision) => revision + 1);
    }
    invalidateOpportunityQueries(queryClient, router, result.data.id);
    return true;
  }

  const meQuery = useQuery({
    queryKey: queryKeys.appMe,
    queryFn: getAppMe,
  });

  // Silent evaluate-on-open — no UI feedback (redesign §2).
  // Do not replace local `opportunity` from this response: it can race a VIN/YMM
  // PATCH and wipe fields the user just saved (#49). Queue/detail refresh still runs.
  const evaluateMutation = useMutation({
    mutationFn: () => evaluateOpportunity(opportunity.id),
    onSuccess: (result) => {
      if (result.ok) {
        invalidateOpportunityQueries(queryClient, router, opportunity.id);
      }
    },
  });

  useEffect(() => {
    if (meQuery.data?.ok) {
      evaluateMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity.id, meQuery.data?.ok]);

  const claimMutation = useMutation({
    mutationFn: () => claimOpportunity(opportunity.id),
    onSuccess: (result) => {
      if (applyDetailResult(result, { bumpForms: false })) {
        toast.success(PAGE_COPY.claimAction);
        return;
      }
      // Narrow ApiResult before .error — boolean helpers do not narrow the union.
      if (!result.ok) toast.error(codeMessage(result.error));
    },
  });

  const assignMutation = useMutation({
    mutationFn: (assignedToUserId: string | null) =>
      assignOpportunity(opportunity.id, { assignedToUserId }),
    onSuccess: (result) => {
      if (applyDetailResult(result, { bumpForms: false })) {
        toast.success("Assignment updated");
        return;
      }
      if (!result.ok) toast.error(codeMessage(result.error));
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: MutatableWorkflowStatus) =>
      updateOpportunityStatus(opportunity.id, { status }),
    onSuccess: (result, status) => {
      if (applyDetailResult(result, { bumpForms: false })) {
        const label =
          status === "purchased"
            ? "Bought"
            : status === "passed"
              ? "Passed"
              : status === "contacted"
                ? "Contacted"
                : "Updated";
        toast.success(`Marked ${label.toLowerCase()}`);
        return;
      }
      if (!result.ok) toast.error(codeMessage(result.error));
    },
  });

  const patchMutation = useMutation({
    mutationFn: (body: Parameters<typeof patchOpportunity>[1]) =>
      patchOpportunity(opportunity.id, body),
    onSuccess: (result) => {
      if (applyDetailResult(result, { bumpForms: true })) {
        toast.success("Saved");
        return;
      }
      if (!result.ok) toast.error(codeMessage(result.error));
    },
  });

  const patchError = patchMutation.isError
    ? "Save failed — please try again."
    : patchMutation.data && !patchMutation.data.ok
      ? codeMessage(patchMutation.data.error)
      : null;

  const me = meQuery.data?.ok ? meQuery.data.data : null;
  const canClaim = me?.role === "admin" || me?.role === "closer";
  const canMutate = canMutateWorkflow(me, opportunity);
  const claimActive = isClaimActive(opportunity.claimExpiresAt);
  const claimOwnerIsMe =
    opportunity.claimedBy === me?.displayName || opportunity.claimedBy === me?.id;

  // Collision detection reused from the workflow block logic.
  const collision = useMemo(() => {
    if (!me) return null;
    if (
      opportunity.claimedBy &&
      claimActive &&
      opportunity.claimedBy !== me.displayName &&
      opportunity.claimedBy !== me.id
    ) {
      return `${opportunity.claimedBy} is working this deal.`;
    }
    return null;
  }, [me, opportunity.claimedBy, claimActive]);

  const hasCollision = collision !== null;

  const primaryAction = getPrimaryWorkflowAction({
    opportunity,
    canClaim,
    canMutate,
    claimActive,
    claimOwnerIsMe,
    hasCollision,
  });

  const secondaryActions = getSecondaryWorkflowActions({
    opportunity,
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

  // Title Information is collapsed by default until the deal reaches
  // Appraised (or later) — reduces initial scroll/clutter on the detail page
  // (NEXT_STEPS #58). Auto-expands once the stepper reaches that step.
  const titleInfoDefaultOpen = resolveDetailStep(opportunity) === "appraised";

  const claimBannerState = resolveClaimBannerState({
    canMutate,
    canClaim,
    collision,
  });

  return (
    <div className="space-y-4">
      <OpportunityDetailHero
        opportunity={opportunity}
        primaryAction={heroPrimaryAction}
        secondaryActions={heroSecondaryActions}
      />

      <OpportunityClaimBanner state={claimBannerState} />

      {/* Contact + Vehicle side by side on desktop, stacked on mobile — use the
          full page width instead of a narrow single-column form (NEXT_STEPS #58).
          `items-start` keeps each card sized to its own content instead of both
          stretching to match Vehicle's taller field list (leaves Contact with a
          big dead-space gap otherwise, since it only has 6 fields). */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <CollapsibleBlock title="Contact Information" description="Seller contact details">
          <OpportunityContactInfoBlock
            key={`contact-${patchRevision}`}
            opportunity={opportunity}
            onSave={(patch) => patchMutation.mutate(patch)}
            pending={patchMutation.isPending}
            canMutate={canMutate}
            error={patchError}
          />
        </CollapsibleBlock>

        <CollapsibleBlock title="Vehicle" description="Identity fields">
          <OpportunityVehicleBlock
            key={`vehicle-${patchRevision}`}
            opportunity={opportunity}
            onSave={(patch) => patchMutation.mutate(patch)}
            pending={patchMutation.isPending}
            canMutate={canMutate}
            error={patchError}
          />
        </CollapsibleBlock>
      </div>

      <CollapsibleBlock
        title="Salesperson / Appraisal Information"
        description="Salesperson and appraiser"
      >
        <OpportunitySalespersonAppraisalBlock
          key={`salesperson-${patchRevision}`}
          opportunity={opportunity}
          onSave={(patch) => patchMutation.mutate(patch)}
          pending={patchMutation.isPending}
          canMutate={canMutate}
          error={patchError}
        />
      </CollapsibleBlock>

      <CollapsibleBlock title="Valuation" description="MMR + Max buy summary">
        {/* Remount when valuation identity changes so MMR/Max buy auto-run fresh
            after VIN decode or Y/M/M/S save (NEXT_STEPS #48). */}
        <OpportunityValuationBlock
          key={[
            opportunity.id,
            opportunity.vin ?? "",
            opportunity.year ?? "",
            opportunity.make ?? "",
            opportunity.model ?? "",
            opportunity.style ?? "",
            opportunity.mileage ?? "",
          ].join("|")}
          opportunity={opportunity}
        />
      </CollapsibleBlock>

      <CollapsibleBlock
        // Re-seed defaultOpen when the step crosses the Appraised boundary so
        // the section auto-expands live, not only on next page load.
        key={`title-info-shell-${titleInfoDefaultOpen}`}
        title="Title Information"
        description="Title, lien, and tag details"
        defaultOpen={titleInfoDefaultOpen}
      >
        <OpportunityTitleInformationBlock
          key={`title-${patchRevision}`}
          opportunity={opportunity}
          onSave={(patch) => patchMutation.mutate(patch)}
          pending={patchMutation.isPending}
          canMutate={canMutate}
          error={patchError}
        />
      </CollapsibleBlock>

      <CollapsibleBlock title="Notes" description="Closer-added context">
        <OpportunityNotesBlock
          opportunityId={opportunity.id}
          actions={opportunity.actions}
          canMutate={canMutate}
        />
      </CollapsibleBlock>

      <CollapsibleBlock title="Workflow" description="Stepper, assignment, claim">
        <div className="space-y-4">
          <OpportunityWorkflowStepper opportunity={opportunity} />
          <OpportunityWorkflowBlock
            opportunity={opportunity as WorkflowTarget & { id: string }}
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
        <OpportunityActionHistory actions={opportunity.actions} />
      </CollapsibleBlock>
    </div>
  );
}
