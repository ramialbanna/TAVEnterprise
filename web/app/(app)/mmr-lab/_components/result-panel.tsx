"use client";

import type { ApiResult } from "@/lib/app-api";
import type { MmrVinOk } from "@/lib/app-api/schemas";
import { formatDateTime, formatMoney } from "@/lib/format";
import { recommend, type RecommendationVerdict } from "@/lib/recommendation";
import {
  ErrorState,
  PendingBackendState,
  UnavailableState,
} from "@/components/data-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Pure-presentational result panel for the MMR Lab.
 *
 * Render rules:
 *   - `result === null`            → quiet placeholder (no lookup yet).
 *   - `result.ok`                  → MMR value, confidence pill, method, timestamp,
 *                                    spread (when `askingPrice` is set), recommendation
 *                                    from `recommend()`, heuristic disclosure, and a
 *                                    `<details>`-collapsed raw JSON payload.
 *   - `kind:"unavailable"`         → `UnavailableState` + Retry when `onRetry` is wired.
 *   - any other non-ok kind        → `ErrorState` + the Worker's `issues` (if any) +
 *                                    Retry only when `isRetryableError` allows it (ErrorState
 *                                    already enforces that — we just pass `onRetry`).
 *
 * Year/Make/Model/Trim are deliberately rendered as `PendingBackendState` — the lean
 * `/app/mmr/vin` envelope does not return them; surfacing the gap (not a fabricated value)
 * is the v1 product call. No fabricated numbers anywhere.
 */
export function ResultPanel({
  result,
  askingPrice,
  lookedUpAt,
  onRetry,
}: {
  result: ApiResult<MmrVinOk> | null;
  /** Client-only field — never sent to the API; only used for the local spread/recommendation. */
  askingPrice: number | null;
  /** ISO timestamp the lookup was submitted client-side. */
  lookedUpAt: string | null;
  onRetry?: () => void;
}) {
  if (result === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Result
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Run a VIN lookup to see the Cox MMR value, confidence, and a heuristic
            recommendation.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!result.ok) {
    if (result.kind === "unavailable") {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Result
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <UnavailableState code={result.error} title="Lookup unavailable" />
            {onRetry ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onRetry}
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Retry lookup
                </button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Result
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ErrorState error={result} onRetry={onRetry} />
          {result.issues && result.issues.length > 0 ? (
            <ul className="space-y-1 text-xs text-status-error">
              {result.issues.map((issue, i) => (
                <li key={i}>
                  <code className="text-[11px]">{JSON.stringify(issue)}</code>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const { mmrValue, confidence, method } = result.data;
  const spread = askingPrice !== null && Number.isFinite(askingPrice) ? mmrValue - askingPrice : null;
  const verdict = recommend({ spread, confidence });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Result
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <p className="text-3xl font-semibold tabular-nums">{formatMoney(mmrValue)}</p>
          <Badge variant={confidenceVariant(confidence)} className="uppercase">
            {confidence}
          </Badge>
        </div>

        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Row label="Method">
            <span>{methodLabel(method)}</span>
          </Row>
          <Row label="Looked up">
            <span>{lookedUpAt ? formatDateTime(lookedUpAt) : "—"}</span>
          </Row>
          <Row label="Spread">
            {spread === null ? (
              <span className="text-muted-foreground">
                Enter an asking price for a spread &amp; recommendation.
              </span>
            ) : (
              <SpreadLine spread={spread} />
            )}
          </Row>
          <Row label="Recommendation">
            {spread === null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <RecommendationLine verdict={verdict} />
            )}
          </Row>
        </dl>

        <p className="text-xs text-muted-foreground">
          Heuristic — not the production buy-box score.
        </p>

        <Separator />

        <section aria-label="Vehicle identity (pending backend)" className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Vehicle identity
          </p>
          <div className="flex flex-wrap gap-2">
            <PendingBackendState label="Year" size="inline" />
            <PendingBackendState label="Make" size="inline" />
            <PendingBackendState label="Model" size="inline" />
            <PendingBackendState label="Trim" size="inline" />
          </div>
          <p className="text-xs text-muted-foreground">
            The lean `/app/mmr/vin` envelope returns valuation only; YMM details light up
            when the backend endpoint adds them.
          </p>
        </section>

        <details className="rounded-md border border-border bg-surface-sunken p-2 text-xs">
          <summary className="cursor-pointer select-none font-medium text-muted-foreground">
            Raw payload
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">
            {JSON.stringify(result.data, null, 2)}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[max-content_1fr] items-start gap-x-3">
      <dt className="pt-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function Separator() {
  return <hr className="border-border" />;
}

function SpreadLine({ spread }: { spread: number }) {
  if (spread > 0) {
    return (
      <span>
        Headroom <span className="font-medium tabular-nums">{formatMoney(spread)}</span>
      </span>
    );
  }
  if (spread < 0) {
    return (
      <span>
        Overpriced by{" "}
        <span className="font-medium tabular-nums">{formatMoney(Math.abs(spread))}</span>
      </span>
    );
  }
  return <span>Even (no headroom)</span>;
}

const VERDICT_LABEL: Record<RecommendationVerdict, string> = {
  strong_buy: "Strong Buy",
  review: "Review",
  pass: "Pass",
  insufficient: "—",
};

const VERDICT_VARIANT: Record<RecommendationVerdict, "healthy" | "review" | "error" | "neutral"> = {
  strong_buy: "healthy",
  review: "review",
  pass: "error",
  insufficient: "neutral",
};

function RecommendationLine({ verdict }: { verdict: RecommendationVerdict }) {
  return <Badge variant={VERDICT_VARIANT[verdict]}>{VERDICT_LABEL[verdict]}</Badge>;
}

function confidenceVariant(c: MmrVinOk["confidence"]): "healthy" | "review" | "error" {
  switch (c) {
    case "high":
      return "healthy";
    case "medium":
      return "review";
    case "low":
    default:
      return "error";
  }
}

function methodLabel(method: MmrVinOk["method"]): string {
  switch (method) {
    case "vin":
      return "VIN match";
    case "year_make_model":
      return "Year / Make / Model";
    default:
      return "—";
  }
}
