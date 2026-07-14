"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { MaxbuyCardActions } from "./maxbuy-card-actions";
import type { MaxBuyCardActionContext, MaxBuyCardMode, MaxBuyCardSnapshot } from "./types";

export type MaxBuyCardProps = {
  mode: MaxBuyCardMode;
  /** Populated when mode is `ready` (Phase 6+). */
  snapshot?: MaxBuyCardSnapshot | null;
  /** When `mode` is `disabled`, explains why evaluate is unavailable. */
  disabledReason?: "coming_soon" | "api_off";
  variant?: "standalone" | "embedded";
  className?: string;
  /** When set with a ready snapshot, enables pass / override / work-item actions (Phase 7). */
  actionContext?: MaxBuyCardActionContext | null;
};

const VERDICT_LABELS: Record<NonNullable<MaxBuyCardSnapshot["verdict"]>, string> = {
  strong_buy: "Strong buy",
  buy: "Buy",
  review: "Review",
  pass: "Pass",
};

function DisabledShell({
  variant,
  disabledReason = "coming_soon",
}: {
  variant: "standalone" | "embedded";
  disabledReason?: "coming_soon" | "api_off";
}) {
  const apiOff = disabledReason === "api_off";
  return (
    <Card className={cn(variant === "embedded" && "border-dashed")}>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Max buy</CardTitle>
          <Badge variant="secondary" className="font-normal">
            {apiOff ? "Off in this env" : "Coming soon"}
          </Badge>
        </div>
        <CardDescription>
          TAV history + costs → recommended max buy and buy/pass verdict. Wholesale (MMR) stays
          available in{" "}
          <Link href="/mmr-lab" className="font-medium text-primary hover:underline">
            TAV MMR
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <p className="flex items-start gap-2">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            {apiOff
              ? "Max buy evaluate is disabled in this environment (MAXBUY_EVALUATE_ENABLED)."
              : "Evaluate API is not live yet. This card will show recommended max buy, data strength, and structured pass/override actions once MaxBuy ships."}
          </p>
        </div>
        <Button type="button" disabled className="w-full sm:w-auto">
          Run max buy
        </Button>
      </CardContent>
    </Card>
  );
}

function AwaitingVinShell({ variant }: { variant: "standalone" | "embedded" }) {
  return (
    <Card className={cn(variant === "embedded" && "border-dashed")}>
      <CardHeader>
        <CardTitle className="text-lg">Max buy</CardTitle>
        <CardDescription>Add a VIN on this listing to run MaxBuy — we won&apos;t guess a verdict without it.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" disabled>
          Run max buy
        </Button>
      </CardContent>
    </Card>
  );
}

function ReadySnapshot({
  snapshot,
  variant,
  actionContext,
}: {
  snapshot: MaxBuyCardSnapshot;
  variant: "standalone" | "embedded";
  actionContext?: MaxBuyCardActionContext | null;
}) {
  const showVerdict = snapshot.displayState === "deal_fit" && snapshot.verdict !== null;

  return (
    <Card className={cn(variant === "embedded" && "border-primary/20")}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-lg">Max buy</CardTitle>
          {snapshot.dataStrength ? (
            <CardDescription>Data strength: {snapshot.dataStrength}</CardDescription>
          ) : null}
        </div>
        {showVerdict && snapshot.verdict ? (
          <Badge>{VERDICT_LABELS[snapshot.verdict]}</Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {snapshot.mmrWholesale !== null ? (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">
              Wholesale (MMR) —{" "}
              <Link href="/mmr-lab" className="font-medium text-primary hover:underline">
                deep lookup
              </Link>
            </span>
            <span className="font-medium tabular-nums">{formatMoney(snapshot.mmrWholesale)}</span>
          </div>
        ) : null}
        {snapshot.recommendedMaxBuy !== null ? (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Recommended max buy</span>
            <span className="font-semibold tabular-nums">{formatMoney(snapshot.recommendedMaxBuy)}</span>
          </div>
        ) : null}
        {snapshot.displayState === "deal_fit" && snapshot.deltaToAsk !== null ? (
          <p className="text-muted-foreground">
            {snapshot.deltaToAsk >= 0
              ? `${formatMoney(snapshot.deltaToAsk)} under ask — room to make target net`
              : `${formatMoney(Math.abs(snapshot.deltaToAsk))} over recommended max`}
          </p>
        ) : null}
        {actionContext ? (
          <MaxbuyCardActions snapshot={snapshot} actionContext={actionContext} />
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Shared MaxBuy surface for `/maxbuy` and deal detail (Phase 4 shell → Phase 6 live). */
export function MaxBuyCard({
  mode,
  snapshot,
  disabledReason,
  variant = "standalone",
  className,
  actionContext = null,
}: MaxBuyCardProps) {
  const body =
    mode === "disabled" ? (
      <DisabledShell variant={variant} disabledReason={disabledReason} />
    ) : mode === "awaiting_vin" ? (
      <AwaitingVinShell variant={variant} />
    ) : snapshot ? (
      <ReadySnapshot snapshot={snapshot} variant={variant} actionContext={actionContext} />
    ) : (
      <DisabledShell variant={variant} />
    );

  return <div className={className}>{body}</div>;
}
