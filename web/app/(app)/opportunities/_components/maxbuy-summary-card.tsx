"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import type { MaxBuyVerdict } from "@/components/maxbuy/types";
import type { MaxbuySummary } from "@/lib/app-api/schemas";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import {
  MaxbuyEvaluationSection,
  type MaxbuyEvaluationState,
} from "../../mmr-lab/_components/maxbuy-evaluation-section";

const SAVED_VERDICT_LABELS: Record<NonNullable<MaxbuySummary["verdict"]>, string> = {
  STRONG_BUY: "Strong buy",
  BUY: "Buy",
  REVIEW: "Review",
  PASS: "Pass",
};

const LIVE_VERDICT_LABELS: Record<NonNullable<MaxBuyVerdict>, string> = {
  strong_buy: "Strong buy",
  buy: "Buy",
  review: "Review",
  pass: "Pass",
};

type Props = {
  savedSummary: MaxbuySummary | null;
  liveState: MaxbuyEvaluationState;
  onRetry?: () => void;
};

function liveVerdictLabel(state: MaxbuyEvaluationState): string | null {
  if (state.kind !== "ready") return null;
  const verdict = state.display.snapshot.verdict;
  return verdict ? LIVE_VERDICT_LABELS[verdict] : null;
}

function liveRecommended(state: MaxbuyEvaluationState): number | null {
  if (state.kind !== "ready") return null;
  return state.display.snapshot.recommendedMaxBuy;
}

function liveDataStrength(state: MaxbuyEvaluationState): string | null {
  if (state.kind !== "ready") return null;
  return state.display.snapshot.dataStrength;
}

export function MaxbuySummaryCard({ savedSummary, liveState, onRetry }: Props) {
  const [expanded, setExpanded] = useState(false);

  const useLive =
    liveState.kind === "ready" ||
    liveState.kind === "loading" ||
    liveState.kind === "error" ||
    liveState.kind === "unavailable";

  const summary = useLive ? null : savedSummary;
  const verdictLabel = useLive
    ? liveVerdictLabel(liveState)
    : summary
      ? SAVED_VERDICT_LABELS[summary.verdict]
      : null;
  const recommended = useLive ? liveRecommended(liveState) : summary?.recommendedMaxBuy ?? null;
  const dataStrength = useLive ? liveDataStrength(liveState) : summary?.dataStrength ?? null;
  const evaluatedAt = summary?.evaluatedAt ?? null;
  const isSaved = !useLive && summary !== null;
  const loading = liveState.kind === "loading";

  if (!summary && liveState.kind === "idle") {
    return null;
  }

  return (
    <Card className="border-border bg-muted/30">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {isSaved ? "Max buy (saved)" : "Max buy"}
          </span>
          {verdictLabel ? <Badge variant="outline">{verdictLabel}</Badge> : null}
        </div>

        {loading ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : liveState.kind === "error" ? (
          <p className="text-sm text-status-error">{liveState.message}</p>
        ) : (
          <dl className="grid gap-2 sm:grid-cols-2">
            <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
              <dt className="text-sm text-muted-foreground">Recommended</dt>
              <dd className="text-right text-sm font-medium tabular-nums">
                {recommended != null ? formatMoney(recommended) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
              <dt className="text-sm text-muted-foreground">Data strength</dt>
              <dd className="text-right text-sm font-medium capitalize">
                {dataStrength ?? "—"}
              </dd>
            </div>
            {evaluatedAt ? (
              <div className="flex justify-between gap-4 border-b border-border/60 pb-2 sm:col-span-2">
                <dt className="text-sm text-muted-foreground">Evaluated</dt>
                <dd className="text-right text-sm font-medium tabular-nums">
                  {formatDateTime(evaluatedAt)}
                </dd>
              </div>
            ) : null}
          </dl>
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
          <MaxbuyEvaluationSection state={liveState} onRetry={onRetry} />
        ) : null}

        {expanded && isSaved && liveState.kind === "idle" && savedSummary ? (
          <p className="text-sm text-muted-foreground">
            Saved verdict from {formatDateTime(savedSummary.evaluatedAt)}. Run a fresh lookup
            to refresh economics and segment history.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
