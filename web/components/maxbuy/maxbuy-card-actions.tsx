"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  addOpportunityNote,
  type MaxbuyOverrideType,
} from "@/lib/app-api/client";
import { codeMessage } from "@/lib/app-api";
import { formatMoney } from "@/lib/format";
import { queryKeys } from "@/lib/query";
import { Button } from "@/components/ui/button";

import type { MaxbuyPassReason } from "./constants";
import { MaxbuyOverrideDialog } from "./maxbuy-override-dialog";
import { MaxbuyPassDialog } from "./maxbuy-pass-dialog";
import type { MaxBuyCardActionContext, MaxBuyCardSnapshot } from "./types";
import { useMaxbuyOverride, useMaxbuyPass } from "./use-maxbuy-feedback";

function defaultPassReason(verdict: MaxBuyCardSnapshot["verdict"]): MaxbuyPassReason {
  if (verdict === "buy" || verdict === "strong_buy" || verdict === "review") {
    return "passed_despite_buy";
  }
  return "price_above_max";
}

export type MaxbuyCardActionsProps = {
  snapshot: MaxBuyCardSnapshot;
  actionContext: MaxBuyCardActionContext;
};

export function MaxbuyCardActions({ snapshot, actionContext }: MaxbuyCardActionsProps) {
  const queryClient = useQueryClient();
  const overrideMutation = useMaxbuyOverride();
  const passMutation = useMaxbuyPass();

  const [passOpen, setPassOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideInitial, setOverrideInitial] = useState<MaxbuyOverrideType>("bid_reduced");
  const [showActedPrice, setShowActedPrice] = useState(false);

  const workItemMutation = useMutation({
    mutationFn: () => {
      if (!actionContext.normalizedListingId) {
        return Promise.reject(new Error("no_listing"));
      }
      const verdictLabel = snapshot.verdict ?? "vehicle fit";
      const note =
        `Max buy work item — recommended max ${formatMoney(snapshot.recommendedMaxBuy)}` +
        ` (${verdictLabel}). Snapshot ${actionContext.recommendationId.slice(0, 8)}…`;
      return addOpportunityNote(actionContext.normalizedListingId, {
        note,
        maxbuy_recommendation_id: actionContext.recommendationId,
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(codeMessage(result.error));
        return;
      }
      toast.success("Work item added to deal history");
      void queryClient.invalidateQueries({
        queryKey: queryKeys.opportunity(actionContext.normalizedListingId!),
      });
    },
    onError: () => toast.error(codeMessage("client_fetch_failed")),
  });

  const submitOverride = (payload: {
    override_type: MaxbuyOverrideType;
    override_note?: string;
    acted_price?: number;
  }) => {
    overrideMutation.mutate(
      {
        recommendation_id: actionContext.recommendationId,
        override_type: payload.override_type,
        override_note: payload.override_note,
        acted_price: payload.acted_price,
      },
      {
        onSuccess: (result) => {
          if (!result.ok) {
            toast.error(codeMessage(result.error));
            return;
          }
          toast.success("Override logged");
          setOverrideOpen(false);
        },
        onError: () => toast.error(codeMessage("client_fetch_failed")),
      },
    );
  };

  const submitPass = (payload: { pass_reason: MaxbuyPassReason; pass_note?: string }) => {
    passMutation.mutate(
      {
        vin: actionContext.vin,
        recommendation_id: actionContext.recommendationId,
        asking_price: snapshot.askingPrice ?? undefined,
        mmr_value: snapshot.mmrWholesale ?? undefined,
        pass_reason: payload.pass_reason,
        pass_note: payload.pass_note,
      },
      {
        onSuccess: (result) => {
          if (!result.ok) {
            toast.error(codeMessage(result.error));
            return;
          }
          toast.success("Pass logged");
          setPassOpen(false);
        },
        onError: () => toast.error(codeMessage("client_fetch_failed")),
      },
    );
  };

  const pending = overrideMutation.isPending || passMutation.isPending || workItemMutation.isPending;

  return (
    <>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setPassOpen(true)}
        >
          Pass anyway
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setOverrideInitial("bid_reduced");
            setShowActedPrice(true);
            setOverrideOpen(true);
          }}
        >
          Bid lower
        </Button>
        {actionContext.normalizedListingId ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => workItemMutation.mutate()}
          >
            Create work item
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setOverrideInitial("other");
            setShowActedPrice(false);
            setOverrideOpen(true);
          }}
        >
          Other override
        </Button>
      </div>

      <MaxbuyPassDialog
        open={passOpen}
        onOpenChange={setPassOpen}
        initialReason={defaultPassReason(snapshot.verdict)}
        pending={passMutation.isPending}
        onSubmit={submitPass}
      />
      <MaxbuyOverrideDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        initialType={overrideInitial}
        showActedPrice={showActedPrice}
        pending={overrideMutation.isPending}
        onSubmit={submitOverride}
      />
    </>
  );
}
