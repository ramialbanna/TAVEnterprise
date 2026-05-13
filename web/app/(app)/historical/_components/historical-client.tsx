"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { listHistoricalSales } from "@/lib/app-api/client";
import type { ApiResult } from "@/lib/app-api";
import type { HistoricalSale } from "@/lib/app-api/schemas";
import { queryKeys } from "@/lib/query";
import { ErrorState, UnavailableState } from "@/components/data-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";

import { FilterBar } from "./filter-bar";
import {
  activeFilterChips,
  applyClientFilters,
  distinctMakes,
  distinctModels,
  INITIAL_FILTER,
  serverFilter,
  type FilterState,
} from "./historical-filters";
import { SalesCharts } from "./sales-charts";
import { SalesTable } from "./sales-table";

/**
 * Client wrapper for `/historical`. Owns the merged filter state, calls
 * `listHistoricalSales` for the documented server-side params (year/make/model/
 * since/limit), and applies the remaining filters in memory (trim, vin-presence,
 * gross range). `initial` is wired only into the initial-unfiltered query so a
 * narrowed filter triggers a real refetch.
 *
 * Distinct make/model lists are derived from the FIRST unfiltered fetch the
 * operator runs — once they pick a make, the model dropdown narrows. If the first
 * fetch returns zero rows the bar falls back to plain text inputs (see FilterBar).
 *
 * Honest states: `kind:"unavailable"` → muted `UnavailableState`; other failure
 * kinds → `ErrorState` + Retry (when `isRetryableError`). No `sellThroughRate`.
 */
export function HistoricalClient({ initial }: { initial: ApiResult<HistoricalSale[]> }) {
  const [filter, setFilter] = useState<FilterState>(INITIAL_FILTER);
  const isInitialFilter = isEqualFilter(filter, INITIAL_FILTER);

  const query = useQuery({
    queryKey: queryKeys.historicalSales(serverFilter(filter)),
    queryFn: () => listHistoricalSales(serverFilter(filter)),
    initialData: isInitialFilter ? initial : undefined,
  });

  // The make/model dropdowns are derived from the most recent ok fetch's rows.
  const rows = query.data && query.data.ok ? query.data.data : null;
  const makeOptions = useMemo(() => (rows ? distinctMakes(rows) : []), [rows]);
  const modelOptions = useMemo(
    () => (rows ? distinctModels(rows, filter.make) : []),
    [rows, filter.make],
  );

  const filteredRows = useMemo(
    () => (rows ? applyClientFilters(rows, filter) : null),
    [rows, filter],
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Showing what TAV&apos;s data currently includes — more columns/filters after
        schema work.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FilterBar
            state={filter}
            onChange={setFilter}
            onClear={() => setFilter(INITIAL_FILTER)}
            makeOptions={makeOptions}
            modelOptions={modelOptions}
          />
        </CardContent>
      </Card>

      <ResultsSummary
        result={query.data}
        filter={filter}
        filteredCount={filteredRows ? filteredRows.length : null}
        onRetry={() => void query.refetch()}
      />

      {query.data && query.data.ok ? (
        <>
          <SalesCharts rows={filteredRows ?? []} />
          <SalesTable
            rows={filteredRows ?? []}
            loading={query.isLoading}
            emptyTitle="No matching sales"
            emptyHint="Adjust the filters above — the server returned rows but none match the client-side filters."
          />
        </>
      ) : null}
    </div>
  );
}

function ResultsSummary({
  result,
  filter,
  filteredCount,
  onRetry,
}: {
  result: ApiResult<HistoricalSale[]> | undefined;
  filter: FilterState;
  filteredCount: number | null;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Results
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {result === undefined ? (
          <p className="text-sm text-muted-foreground">Loading historical sales…</p>
        ) : !result.ok ? (
          result.kind === "unavailable" ? (
            <UnavailableState code={result.error} title="Historical sales unavailable" />
          ) : (
            <ErrorState error={result} onRetry={onRetry} />
          )
        ) : (
          <SummaryLine
            loadedCount={result.data.length}
            filteredCount={filteredCount}
            filter={filter}
          />
        )}
      </CardContent>
    </Card>
  );
}

function SummaryLine({
  loadedCount,
  filteredCount,
  filter,
}: {
  loadedCount: number;
  filteredCount: number | null;
  filter: FilterState;
}) {
  const chips = activeFilterChips(filter);
  const filtered = filteredCount ?? loadedCount;
  return (
    <div className="space-y-2 text-sm">
      <p>
        <span className="font-medium tabular-nums">
          {formatNumber(filtered)} of {formatNumber(loadedCount)}
        </span>{" "}
        row{filtered === 1 ? "" : "s"} after filters (server returned {formatNumber(loadedCount)}).
      </p>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <Badge key={chip.key} variant="neutral">
              {chip.label}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No active filters.</p>
      )}
    </div>
  );
}

function isEqualFilter(a: FilterState, b: FilterState): boolean {
  return (
    a.limit === b.limit &&
    a.since === b.since &&
    a.year === b.year &&
    a.make === b.make &&
    a.model === b.model &&
    a.trim === b.trim &&
    a.vinPresent === b.vinPresent &&
    a.grossMin === b.grossMin &&
    a.grossMax === b.grossMax
  );
}
