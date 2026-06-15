"use client";

import { AlertCircle, Lock } from "lucide-react";

import {
  buildMaxbuyExplanation,
  labelMaxbuyReasonCode,
} from "@/components/maxbuy/build-explanation";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MaxbuyCardActions } from "@/components/maxbuy/maxbuy-card-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MaxBuyCardSnapshot } from "@/components/maxbuy/types";

export type MaxbuyEvaluationDisplay = {
  snapshot: MaxBuyCardSnapshot;
  economics: {
    expectedSalePrice: number;
    expectedTransport: number;
    expectedExpenses: number;
    expectedNetGross: number | null;
  };
  tavHistorical: {
    nUnits: number;
    avgBuy: number | null;
    avgSale: number | null;
    avgGross: number | null;
    avgDaysToSale: number | null;
  };
};

export type MaxbuyEvaluationState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; display: MaxbuyEvaluationDisplay }
  | { kind: "unavailable"; reason?: "api_off" | "coming_soon" }
  | { kind: "error"; message: string };

type Props = {
  state: MaxbuyEvaluationState;
  onRetry?: () => void;
  className?: string;
};

const VERDICT_LABELS: Record<NonNullable<MaxBuyCardSnapshot["verdict"]>, string> = {
  strong_buy: "Strong buy",
  buy: "Buy",
  review: "Review",
  pass: "Pass",
};

function SectionTitle() {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">
      Max buy evaluation
    </h2>
  );
}

function ReasonCodeDetails({ codes }: { codes: string[] }) {
  if (codes.length === 0) return null;
  return (
    <details className="group rounded-lg border border-border bg-muted/20">
      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          Details
          <span className="text-xs font-normal text-muted-foreground group-open:hidden">
            — scoring signals
          </span>
        </span>
      </summary>
      <ul className="space-y-1.5 border-t border-border px-3 py-2 text-sm text-muted-foreground">
        {codes.map((code) => (
          <li key={code}>{labelMaxbuyReasonCode(code)}</li>
        ))}
      </ul>
    </details>
  );
}

function ExplanationMathLine({
  math,
}: {
  math: NonNullable<ReturnType<typeof buildMaxbuyExplanation>["math"]>;
}) {
  return (
    <p className="text-sm text-foreground">
      <span className="font-medium">Math: </span>
      <span className="tabular-nums">{formatMoney(math.expectedSale)}</span>
      <span className="text-muted-foreground"> expected sale − </span>
      <span className="tabular-nums">{formatMoney(math.transport)}</span>
      <span className="text-muted-foreground"> transport − </span>
      <span className="tabular-nums">{formatMoney(math.expenses)}</span>
      <span className="text-muted-foreground"> reconditioning − </span>
      <span className="tabular-nums">{formatMoney(math.targetNet)}</span>
      <span className="text-muted-foreground"> target profit = </span>
      <span className="font-semibold tabular-nums">{formatMoney(math.maxBuy)}</span>
      <span className="text-muted-foreground"> max buy.</span>
    </p>
  );
}

function MaxbuyExplanationBlock({ display }: { display: MaxbuyEvaluationDisplay }) {
  const explanation = buildMaxbuyExplanation(display);

  if (!explanation.narrative && !explanation.math && !explanation.cautionLine) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-surface-sunken px-4 py-3">
      {explanation.narrative ? (
        <p className="text-sm text-foreground">{explanation.narrative}</p>
      ) : null}
      {explanation.math ? <ExplanationMathLine math={explanation.math} /> : null}
      {explanation.cautionLine ? (
        <p
          className="flex items-start gap-2 rounded-md bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
          role="status"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {explanation.cautionLine}
        </p>
      ) : null}
    </div>
  );
}

function EconomicsGrid({
  economics,
  hasValues,
}: {
  economics: MaxbuyEvaluationDisplay["economics"];
  hasValues: boolean;
}) {
  const rows = [
    { label: "Expected sale", value: hasValues ? economics.expectedSalePrice : null },
    { label: "Transport", value: hasValues ? economics.expectedTransport : null },
    { label: "Expenses", value: hasValues ? economics.expectedExpenses : null },
    { label: "Expected net gross", value: economics.expectedNetGross },
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map(({ label, value }) => (
        <div key={label} className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums">
            {value !== null ? formatMoney(value) : "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

function TavHistoricalSnippet({
  historical,
}: {
  historical: MaxbuyEvaluationDisplay["tavHistorical"];
}) {
  const hasUnits = historical.nUnits > 0;
  return (
    <div className="rounded-md border border-border bg-surface-sunken px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        TAV segment history
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasUnits
          ? `${historical.nUnits.toLocaleString()} comparable outcomes in this segment`
          : "No segment history until MMR anchor is available."}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Avg buy</dt>
          <dd className="font-medium tabular-nums">
            {historical.avgBuy !== null ? formatMoney(historical.avgBuy) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Avg sale</dt>
          <dd className="font-medium tabular-nums">
            {historical.avgSale !== null ? formatMoney(historical.avgSale) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Avg gross</dt>
          <dd className={cn(
            "font-medium tabular-nums",
            historical.avgGross !== null && historical.avgGross < 0 && "text-destructive",
          )}>
            {historical.avgGross !== null ? formatMoney(historical.avgGross) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Avg days</dt>
          <dd className="font-medium tabular-nums">
            {historical.avgDaysToSale !== null
              ? Math.round(historical.avgDaysToSale).toLocaleString()
              : "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function LoadingShell() {
  return (
    <Card className="mt-2">
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="h-16 w-full max-w-md" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
        <Skeleton className="h-24 w-full" />
      </CardContent>
    </Card>
  );
}

function IdleShell() {
  return (
    <Card className="mt-2 border-dashed bg-surface-sunken">
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        Search to run Max buy on this vehicle. Evaluation runs in parallel with MMR lookup.
      </CardContent>
    </Card>
  );
}

function UnavailableShell({ reason = "coming_soon" }: { reason?: "api_off" | "coming_soon" }) {
  const apiOff = reason === "api_off";
  return (
    <Card className="mt-2">
      <CardContent className="space-y-3 p-6">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-normal">
            {apiOff ? "Off in this env" : "Coming soon"}
          </Badge>
        </div>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          {apiOff
            ? "Max buy evaluate is disabled in this environment (MAXBUY_EVALUATE_ENABLED)."
            : "Evaluate API is not available. MMR lookup still works above."}
        </p>
      </CardContent>
    </Card>
  );
}

function ErrorShell({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="mt-2 border-destructive/30">
      <CardContent className="space-y-3 p-6">
        <p className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {message}
        </p>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry Max buy
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ReadyShell({ display }: { display: MaxbuyEvaluationDisplay }) {
  const { snapshot, economics, tavHistorical } = display;
  const showVerdict = snapshot.displayState === "deal_fit" && snapshot.verdict !== null;
  const hasValues = snapshot.recommendedMaxBuy !== null;

  return (
    <Card className="mt-2 overflow-hidden">
      <CardContent className="p-0">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="min-w-0 space-y-4 border-b border-border p-4 sm:p-6 lg:border-b-0 lg:border-r lg:p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Recommended max buy
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-primary sm:text-4xl">
                  {snapshot.recommendedMaxBuy !== null
                    ? formatMoney(snapshot.recommendedMaxBuy)
                    : "—"}
                </p>
              </div>
              {showVerdict && snapshot.verdict ? (
                <Badge className="text-sm">{VERDICT_LABELS[snapshot.verdict]}</Badge>
              ) : snapshot.displayState === "vehicle_fit" ? (
                <Badge variant="neutral">Vehicle ceiling</Badge>
              ) : null}
            </div>

            {snapshot.displayState === "deal_fit" && snapshot.deltaToAsk !== null ? (
              <p className="text-sm text-muted-foreground">
                {snapshot.deltaToAsk >= 0
                  ? `${formatMoney(snapshot.deltaToAsk)} under ask — room to make target net`
                  : `${formatMoney(Math.abs(snapshot.deltaToAsk))} over recommended max`}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Enter a lane ask price above to compare your offer against recommended max buy.
              </p>
            )}

            {snapshot.displayState === "deal_fit" && snapshot.askingPrice !== null ? (
              <p className="text-sm text-muted-foreground">
                Lane ask:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatMoney(snapshot.askingPrice)}
                </span>
              </p>
            ) : null}

            <div className="flex flex-wrap gap-4 text-sm">
              {snapshot.dataStrength ? (
                <span className="text-muted-foreground">
                  Data strength:{" "}
                  <span className="font-medium capitalize text-foreground">
                    {snapshot.dataStrength}
                  </span>
                </span>
              ) : null}
              {snapshot.mmrWholesale !== null ? (
                <span className="text-muted-foreground">
                  Wholesale anchor:{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatMoney(snapshot.mmrWholesale)}
                  </span>
                </span>
              ) : null}
            </div>

            <MaxbuyExplanationBlock display={display} />

            <ReasonCodeDetails codes={snapshot.reasonCodes} />

            {snapshot.recommendationId ? (
              <MaxbuyCardActions
                snapshot={snapshot}
                actionContext={{
                  recommendationId: snapshot.recommendationId,
                  vin: snapshot.vin,
                }}
              />
            ) : null}
          </div>

          <div className="min-w-0 space-y-4 bg-surface-sunken p-4 sm:p-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Economics
              </p>
              <div className="mt-3">
                <EconomicsGrid economics={economics} hasValues={hasValues} />
              </div>
            </div>
            <TavHistoricalSnippet historical={tavHistorical} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Zone C1 — full-width MaxBuy evaluation block (replaces Cox Similar Vehicles). */
export function MaxbuyEvaluationSection({ state, onRetry, className }: Props) {
  return (
    <section className={cn("min-w-0 px-4 sm:px-6", className)} aria-live="polite">
      <SectionTitle />
      {state.kind === "idle" ? <IdleShell /> : null}
      {state.kind === "loading" ? <LoadingShell /> : null}
      {state.kind === "ready" ? <ReadyShell display={state.display} /> : null}
      {state.kind === "unavailable" ? <UnavailableShell reason={state.reason} /> : null}
      {state.kind === "error" ? <ErrorShell message={state.message} onRetry={onRetry} /> : null}
    </section>
  );
}
