"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listHistoricalSales } from "@/lib/app-api/client";
import type { ApiResult } from "@/lib/app-api";
import type { HistoricalSale } from "@/lib/app-api/schemas";
import { queryKeys } from "@/lib/query";
import { comparisonAggregates } from "@/lib/historical-aggregate";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { EmptyState, ErrorState, PendingBackendState, UnavailableState } from "@/components/data-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * TAV historical comparison panel.
 *
 * Driven by the form's year/make/model — the `/app/mmr/vin` envelope doesn't return YMM,
 * so we fall back to the operator's own inputs. When any of year / make / model is
 * blank, the panel renders an honest prompt explaining what is missing (no fabricated
 * comparison).
 *
 * Filter strategy:
 *   - `listHistoricalSales` supports `{ year, make, model, limit }` natively.
 *   - `trim` is filtered CLIENT-SIDE (case-insensitive). The API does not accept a
 *     `trim` param in v1; widening the query and narrowing in-memory keeps us off any
 *     undocumented param.
 *
 * Honest states:
 *   - `ApiResult` failure → `ErrorState` with retry (kind="unavailable" routes to
 *     `UnavailableState`, retryable kinds get a Retry button).
 *   - Zero rows after filter → `EmptyState` ("No matching historical sales").
 *   - `n < 5` → low-confidence badge.
 *
 * Pending placeholders for fields the backend doesn't expose yet (front/back gross
 * split, days-to-sell, regional performance). No `sellThroughRate`.
 */
export function HistoricalComparison({
  year,
  make,
  model,
  trim,
}: {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
}) {
  const ready = year !== null && make !== null && model !== null;

  const query = useQuery({
    queryKey: queryKeys.historicalSales({
      year: ready ? year! : undefined,
      make: ready ? make! : undefined,
      model: ready ? model! : undefined,
      limit: 100,
    }),
    queryFn: () =>
      listHistoricalSales({
        year: year ?? undefined,
        make: make ?? undefined,
        model: model ?? undefined,
        limit: 100,
      }),
    enabled: ready,
  });

  const filtered: HistoricalSale[] | null = useMemo(() => {
    if (!query.data || !query.data.ok) return null;
    if (!trim) return query.data.data;
    const t = trim.toLowerCase();
    return query.data.data.filter((r) => (r.trim ?? "").toLowerCase() === t);
  }, [query.data, trim]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          TAV historical comparison
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!ready ? (
          <PromptForYmm year={year} make={make} model={model} />
        ) : query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading comparisons…</p>
        ) : !query.data ? (
          <p className="text-sm text-muted-foreground">Loading comparisons…</p>
        ) : !query.data.ok ? (
          <FailureState result={query.data} onRetry={() => void query.refetch()} />
        ) : (filtered ?? []).length === 0 ? (
          <EmptyState
            title="No matching historical sales"
            hint={
              <>
                No prior TAV sales match{" "}
                <strong>
                  {year} {make} {model}
                  {trim ? ` ${trim}` : ""}
                </strong>{" "}
                in the most recent 100 rows.
              </>
            }
          />
        ) : (
          <AggregateView rows={filtered!} />
        )}

        <section aria-label="Pending backend fields" className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Coming soon — backend not built
          </p>
          <div className="flex flex-wrap gap-2">
            <PendingBackendState label="Front / back gross split" size="inline" />
            <PendingBackendState label="Days to sell" size="inline" />
            <PendingBackendState label="Regional performance" size="inline" />
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function PromptForYmm({
  year,
  make,
  model,
}: {
  year: number | null;
  make: string | null;
  model: string | null;
}) {
  const missing = [
    year === null ? "year" : null,
    make === null ? "make" : null,
    model === null ? "model" : null,
  ].filter(Boolean) as string[];
  return (
    <div
      className="rounded-md border border-dashed border-border bg-surface-sunken px-4 py-6 text-center text-sm text-muted-foreground"
      role="note"
    >
      Enter <strong>year</strong>, <strong>make</strong>, and <strong>model</strong> to
      see matching TAV historical sales.
      <span className="mt-1 block text-xs">
        Missing: {missing.length > 0 ? missing.join(", ") : "—"}.
      </span>
    </div>
  );
}

function FailureState({
  result,
  onRetry,
}: {
  result: Extract<ApiResult<HistoricalSale[]>, { ok: false }>;
  onRetry: () => void;
}) {
  if (result.kind === "unavailable") {
    return <UnavailableState code={result.error} title="Comparison unavailable" />;
  }
  return <ErrorState error={result} onRetry={onRetry} />;
}

function AggregateView({ rows }: { rows: HistoricalSale[] }) {
  const agg = comparisonAggregates(rows);
  const lowConfidence = agg.count < 5;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm">
          <span className="font-medium tabular-nums">n = {formatNumber(agg.count)}</span>{" "}
          similar unit{agg.count === 1 ? "" : "s"}
        </p>
        {lowConfidence ? (
          <Badge variant="review" className="uppercase">
            low confidence (n &lt; 5)
          </Badge>
        ) : null}
      </div>

      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <Stat label="Last sold">
          {agg.lastSoldDate ? formatDate(agg.lastSoldDate) : <Missing />}
        </Stat>
        <Stat label="Avg sale price">
          {agg.avgSalePrice !== null ? formatMoney(agg.avgSalePrice) : <Missing />}
        </Stat>
        <Stat label="Median sale price">
          {agg.medianSalePrice !== null ? formatMoney(agg.medianSalePrice) : <Missing />}
        </Stat>
        <Stat label="Avg acquisition cost">
          {agg.avgAcquisitionCost !== null ? formatMoney(agg.avgAcquisitionCost) : <Missing />}
        </Stat>
        <Stat label="Avg gross profit">
          {agg.avgGross !== null ? formatMoney(agg.avgGross) : <Missing />}
        </Stat>
      </dl>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[max-content_1fr] items-start gap-x-3">
      <dt className="pt-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

function Missing() {
  return <span className="text-muted-foreground">Not available</span>;
}
