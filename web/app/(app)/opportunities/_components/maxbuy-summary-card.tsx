"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown, Lock } from "lucide-react";

import { computeMaxbuyDealGrade } from "@/components/maxbuy/maxbuy-deal-grade";
import { MaxbuyGradeBadge } from "@/components/maxbuy/maxbuy-grade-badge";
import type { MaxbuySummary } from "@/lib/app-api/schemas";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import {
  MaxbuyDetailsPanel,
  type MaxbuyEvaluationState,
} from "../../mmr-lab/_components/maxbuy-evaluation-section";

type Props = {
  savedSummary: MaxbuySummary | null;
  liveState: MaxbuyEvaluationState;
  /** Shown when MMR can run but Max buy identity is insufficient (YMM without mileage/price). */
  placeholderMessage?: string | null;
};

function formatDeltaToAsk(delta: number): string {
  if (delta >= 0) {
    return `${formatMoney(delta)} under ask`;
  }
  return `${formatMoney(Math.abs(delta))} over recommended max`;
}

function UnavailableBody({ reason }: { reason?: "api_off" | "coming_soon" }) {
  const apiOff = reason === "api_off";
  return (
    <div className="space-y-2">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
        {apiOff
          ? "Max buy evaluate is disabled in this environment."
          : "Evaluate API is not available. MMR lookup still works."}
      </p>
    </div>
  );
}

function HeroMoney({ value, loading }: { value: number | null; loading: boolean }) {
  if (loading) {
    return <Skeleton className="h-8 w-32" />;
  }
  return (
    <div className="text-2xl font-semibold tabular-nums text-primary">
      {value != null ? formatMoney(value) : "—"}
    </div>
  );
}

export function MaxbuySummaryCard({
  savedSummary,
  liveState,
  placeholderMessage = null,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const useLive =
    liveState.kind === "ready" ||
    liveState.kind === "loading" ||
    liveState.kind === "error" ||
    liveState.kind === "unavailable";

  const isPlaceholder =
    !savedSummary && liveState.kind === "idle" && !!placeholderMessage;

  const summary = useLive ? null : savedSummary;
  const loading = liveState.kind === "loading";
  const isSaved = !useLive && summary !== null;

  const recommended =
    liveState.kind === "ready"
      ? liveState.display.snapshot.recommendedMaxBuy
      : summary?.recommendedMaxBuy ?? null;

  const evaluatedAt =
    liveState.kind === "ready"
      ? null
      : summary?.evaluatedAt ?? null;

  const grade =
    liveState.kind === "ready"
      ? computeMaxbuyDealGrade({
          verdict: liveState.display.snapshot.verdict,
          dataStrength: liveState.display.snapshot.dataStrength,
          deltaToAsk: liveState.display.snapshot.deltaToAsk,
          displayState: liveState.display.snapshot.displayState,
        })
      : summary
        ? computeMaxbuyDealGrade({
            verdict: summary.verdict,
            dataStrength: summary.dataStrength,
            displayState: "deal_fit",
          })
        : null;

  const deltaLine =
    liveState.kind === "ready" &&
    liveState.display.snapshot.displayState === "deal_fit" &&
    liveState.display.snapshot.deltaToAsk != null
      ? formatDeltaToAsk(liveState.display.snapshot.deltaToAsk)
      : null;

  const secondaryParts = [
    deltaLine,
    isSaved && evaluatedAt ? `As of ${formatDateTime(evaluatedAt)}` : null,
    liveState.kind === "ready" ? "Live evaluation" : null,
  ].filter(Boolean);

  if (!summary && liveState.kind === "idle" && !isPlaceholder) {
    return null;
  }

  return (
    <Card
      className={cn(
        "border-border bg-muted/30",
        isPlaceholder && "border-dashed bg-surface-sunken",
      )}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Max buy
          </span>
          {!isPlaceholder && liveState.kind !== "error" && liveState.kind !== "unavailable" ? (
            loading ? (
              <Skeleton className="size-11 rounded-full" />
            ) : (
              <MaxbuyGradeBadge grade={grade} />
            )
          ) : null}
        </div>

        {isPlaceholder ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{placeholderMessage}</span>
          </p>
        ) : liveState.kind === "error" ? (
          <p className="text-sm text-status-error">{liveState.message}</p>
        ) : liveState.kind === "unavailable" ? (
          <UnavailableBody reason={liveState.reason} />
        ) : (
          <>
            <div className="space-y-1">
              <HeroMoney value={recommended} loading={loading} />
              {secondaryParts.length > 0 ? (
                <p className="text-xs text-muted-foreground">{secondaryParts.join(" · ")}</p>
              ) : null}
            </div>
          </>
        )}

        {liveState.kind === "ready" || (isSaved && savedSummary) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? "Hide details" : "Details"}
            <ChevronDown
              className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
              aria-hidden
            />
          </Button>
        ) : null}

        {expanded && liveState.kind === "ready" ? (
          <MaxbuyDetailsPanel display={liveState.display} />
        ) : null}

        {expanded && isSaved && liveState.kind === "idle" && savedSummary ? (
          <p className="text-sm text-muted-foreground">
            Saved evaluation from {formatDateTime(savedSummary.evaluatedAt)}. Use{" "}
            <span className="font-medium text-foreground">Refresh valuation</span> to update
            max buy and economics.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
