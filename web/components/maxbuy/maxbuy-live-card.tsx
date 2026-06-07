"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { getSystemStatus, type MaxbuyEvaluateRequest } from "@/lib/app-api/client";
import { codeMessage } from "@/lib/app-api";
import { queryKeys } from "@/lib/query";

import { MaxBuyCard } from "./maxbuy-card";
import type { MaxBuyCardActionContext, MaxBuyCardSnapshot } from "./types";
import { mapMaxbuyEvaluateToSnapshot } from "./map-snapshot";
import { MaxbuyEvaluateForm, type MaxbuyEvaluateFormValues } from "./maxbuy-evaluate-form";
import { useMaxbuyEvaluate } from "./use-maxbuy-evaluate";

const REGION_KEYS = new Set([
  "dallas_tx",
  "houston_tx",
  "austin_tx",
  "san_antonio_tx",
  "lubbock_tx",
  "oklahoma_city_ok",
]);

export type MaxbuyLiveCardProps = {
  variant?: "standalone" | "embedded";
  className?: string;
  /** When set, VIN is required; form is hidden until VIN exists on embedded deals. */
  initialValues: MaxbuyEvaluateFormValues;
  vinReadOnly?: boolean;
  normalizedListingId?: string;
  leadId?: string;
  /** Standalone lane lookup shows region picker. */
  showRegion?: boolean;
};

export function MaxbuyLiveCard({
  variant = "standalone",
  className,
  initialValues,
  vinReadOnly = false,
  normalizedListingId,
  leadId,
  showRegion = false,
}: MaxbuyLiveCardProps) {
  const [snapshot, setSnapshot] = useState<MaxBuyCardSnapshot | null>(null);
  const evaluate = useMaxbuyEvaluate();

  const actionContext: MaxBuyCardActionContext | null = snapshot
    ? {
        recommendationId: snapshot.recommendationId,
        vin: snapshot.vin,
        normalizedListingId,
      }
    : null;

  const statusQuery = useQuery({
    queryKey: queryKeys.systemStatus,
    queryFn: getSystemStatus,
    staleTime: 30_000,
  });

  const apiEnabled =
    statusQuery.data?.ok === true && statusQuery.data.data.maxbuy?.enabled === true;

  const formInitial = useMemo(() => {
    const region =
      initialValues.region && REGION_KEYS.has(initialValues.region)
        ? (initialValues.region as MaxbuyEvaluateFormValues["region"])
        : "";
    return { ...initialValues, region };
  }, [initialValues]);

  if (statusQuery.isPending) {
    return (
      <div className={className}>
        <p className="text-sm text-muted-foreground">Checking Max buy availability…</p>
      </div>
    );
  }

  if (!apiEnabled) {
    return <MaxBuyCard mode="disabled" disabledReason="api_off" variant={variant} className={className} />;
  }

  const extras: Pick<MaxbuyEvaluateRequest, "normalized_listing_id" | "lead_id"> = {};
  if (normalizedListingId) extras.normalized_listing_id = normalizedListingId;
  if (leadId) extras.lead_id = leadId;

  const handleSubmit = (body: MaxbuyEvaluateRequest, askingPrice: number | null) => {
    evaluate.mutate(
      { ...body, ...extras },
      {
        onSuccess: (result) => {
          if (!result.ok) {
            toast.error(codeMessage(result.error));
            return;
          }
          setSnapshot(mapMaxbuyEvaluateToSnapshot(result.data, askingPrice));
        },
        onError: () => {
          toast.error(codeMessage("client_fetch_failed"));
        },
      },
    );
  };

  if (snapshot) {
    return (
      <div className={className}>
        <MaxBuyCard
          mode="ready"
          snapshot={snapshot}
          variant={variant}
          actionContext={actionContext}
        />
        <div className="mt-4">
          <MaxbuyEvaluateForm
            initial={formInitial}
            vinReadOnly={vinReadOnly}
            showRegion={showRegion}
            pending={evaluate.isPending}
            onSubmit={(body, asking) => {
              setSnapshot(null);
              handleSubmit(body, asking);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <MaxbuyEvaluateForm
        initial={formInitial}
        vinReadOnly={vinReadOnly}
        showRegion={showRegion}
        pending={evaluate.isPending}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
