"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { claimOpportunity, getAppMe } from "@/lib/app-api/client";
import { codeMessage } from "@/lib/app-api";
import type { OpportunityDetail } from "@/lib/app-api/schemas";
import { PAGE_COPY } from "@/lib/copy/opportunities-labels";
import {
  getPrimaryWorkflowAction,
  isClaimActive,
} from "@/lib/opportunities/workflow-steps";
import { canMutateWorkflow } from "./workflow-helpers";
import { queryKeys } from "@/lib/query";
import { formatMoney, formatNumber } from "@/lib/format";
import { MaxBuyCard } from "@/components/maxbuy/maxbuy-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { OpportunityDetailHero } from "./opportunity-detail-hero";
import { OpportunityWorkflowStepper } from "./opportunity-workflow-stepper";
import { OpportunityWorkflowPanelNew } from "./opportunity-workflow-panel-new";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function OpportunityDetailClientNew({
  initial,
}: {
  initial: OpportunityDetail;
}) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: queryKeys.appMe,
    queryFn: getAppMe,
  });

  const claimMutation = useMutation({
    mutationFn: () => claimOpportunity(initial.id),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(PAGE_COPY.claimAction);
        void queryClient.invalidateQueries({ queryKey: queryKeys.opportunity(initial.id) });
        void queryClient.invalidateQueries({ queryKey: ["opportunities-page"] });
        return;
      }
      toast.error(codeMessage(result.error));
    },
  });

  const me = meQuery.data?.ok ? meQuery.data.data : null;
  const canClaim = me?.role === "admin" || me?.role === "closer";
  const canMutate = canMutateWorkflow(me, initial);
  const claimActive = isClaimActive(initial.claimExpiresAt);
  const claimOwnerIsMe =
    initial.claimedBy === me?.displayName || initial.claimedBy === me?.id;

  const primaryWorkflow = getPrimaryWorkflowAction({
    opportunity: initial,
    canClaim,
    canMutate,
    claimActive,
    claimOwnerIsMe,
    hasCollision: false,
  });

  const heroPrimaryAction = useMemo(() => {
    if (primaryWorkflow.kind !== "claim") return null;
    return (
      <Button
        size="sm"
        onClick={() => claimMutation.mutate()}
        disabled={claimMutation.isPending}
      >
        {primaryWorkflow.label}
      </Button>
    );
  }, [primaryWorkflow, claimMutation.isPending]);

  const maxBuyMode = !initial.vin?.trim() ? ("awaiting_vin" as const) : ("disabled" as const);

  return (
    <div className="space-y-6">
      <OpportunityDetailHero opportunity={initial} primaryAction={heroPrimaryAction} />

      <MaxBuyCard mode={maxBuyMode} variant="embedded" />

      <OpportunityWorkflowStepper opportunity={initial} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Valuation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailRow label="Asking price" value={formatMoney(initial.price)} />
            <DetailRow label="MMR" value={formatMoney(initial.mmrValue)} />
            <DetailRow label="Spread vs MMR" value={formatMoney(initial.spread)} />
            <DetailRow label="Score" value={formatNumber(initial.finalScore)} />
            <DetailRow label="Grade" value={initial.grade ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Vehicle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailRow label="VIN" value={initial.vin ?? "—"} />
            <DetailRow label="Mileage" value={formatNumber(initial.mileage)} />
            <DetailRow label="Region" value={initial.region ?? "—"} />
            <DetailRow label="Seen count" value={formatNumber(initial.seenCount)} />
          </CardContent>
        </Card>
      </div>

      <OpportunityWorkflowPanelNew
        opportunity={initial}
        actions={initial.actions}
        recordEvaluation
      />
    </div>
  );
}
