"use client";

import type { HistoricalSale } from "@/lib/app-api/schemas";
import {
  bucketAvgSalePriceByMonth,
  bucketCountByMonth,
  bucketGrossByMonth,
  histogramBuckets,
  segmentRollup,
} from "@/lib/historical-aggregate";
import { BarChartCard, HistogramCard, LineChartCard } from "@/components/charts";
import { PendingBackendState } from "@/components/data-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";

/**
 * Historical sales charts over the currently filtered rows.
 *
 * Five views — all derived from the same `filteredRows` slice the table renders:
 *   1. Gross by month (line, area)
 *   2. Volume by month (bar)
 *   3. Avg gross by top make/model segments (bar, top-N by count)
 *   4. TAV sale-price trend (line) — explicitly labelled "TAV sale price, not market
 *      retail" so a viewer can never mistake it for a retail valuation
 *   5. Gross distribution histogram (fixed dollar-edge buckets)
 *
 * Plus three `PendingBackendState` placeholders for fields the schema doesn't expose
 * yet: days-to-sell by segment, aging/velocity, wholesale-to-retail spread.
 *
 * Every chart's caption surfaces the **returned-sample n** (filtered count) and is
 * explicit that this is not a full-database aggregate. `bucketGrossByMonth`,
 * `bucketAvgSalePriceByMonth`, `bucketCountByMonth`, and `histogramBuckets` all skip
 * null / non-finite values — no `$0` is ever fabricated. `sellThroughRate` is never
 * rendered.
 */
const TOP_SEGMENT_LIMIT = 6;
const GROSS_HISTOGRAM_EDGES = [-2000, -500, 0, 500, 1000, 2000, 3000, 5000, 10000] as const;

export function SalesCharts({ rows }: { rows: ReadonlyArray<HistoricalSale> }) {
  const sampleNote = `Based on the returned sample (n = ${rows.length}) after active filters — not a full-database aggregate.`;

  const grossByMonth = bucketGrossByMonth(rows).map((b) => ({ label: b.month, value: b.avgGross }));
  const volumeByMonth = bucketCountByMonth(rows).map((b) => ({ label: b.month, value: b.count }));
  const priceByMonth = bucketAvgSalePriceByMonth(rows).map((b) => ({
    label: b.month,
    value: b.avgSalePrice,
  }));

  const segments = segmentRollup(rows, "model")
    .filter((s) => s.avgGross !== null)
    .slice(0, TOP_SEGMENT_LIMIT)
    .map((s) => ({ label: s.segment, value: s.avgGross as number }));

  const histogram = histogramBuckets(
    rows.map((r) => r.grossProfit),
    GROSS_HISTOGRAM_EDGES,
  ).map((b) => ({ bucketLabel: formatBucketLabel(b.lo, b.hi), count: b.count }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Returned-sample charts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">{sampleNote}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <LineChartCard
          title="Gross by month"
          data={grossByMonth}
          variant="area"
          minPoints={2}
          categoryLabel="Month"
          valueLabel="Avg gross profit"
          ariaLabel="Monthly average gross profit, returned sample"
          caption={sampleNote}
        />
        <BarChartCard
          title="Volume by month"
          data={volumeByMonth}
          categoryLabel="Month"
          valueLabel="Sales"
          ariaLabel="Sales volume by month, returned sample"
          caption={sampleNote}
          fill={2}
        />
        <BarChartCard
          title={`Top ${TOP_SEGMENT_LIMIT} models by volume — avg gross`}
          data={segments}
          categoryLabel="Model"
          valueLabel="Avg gross profit"
          ariaLabel="Average gross profit by top model segments"
          caption={`Top ${TOP_SEGMENT_LIMIT} models ranked by returned-row count. ${sampleNote}`}
          fill={3}
        />
        <LineChartCard
          title="TAV sale price trend — not market retail"
          data={priceByMonth}
          variant="line"
          minPoints={2}
          categoryLabel="Month"
          valueLabel="Avg TAV sale price"
          ariaLabel="Monthly TAV average sale price, returned sample"
          caption={`TAV sale price, not market retail. ${sampleNote}`}
          stroke={4}
        />
      </div>

      <HistogramCard
        title="Gross profit distribution"
        data={histogram}
        ariaLabel="Distribution of gross profit across the returned sample"
        caption={sampleNote}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Coming soon — pending backend
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <PendingBackendState label="Days to sell by segment" size="inline" />
            <PendingBackendState label="Aging / velocity" size="inline" />
            <PendingBackendState label="Wholesale-to-retail spread" size="inline" />
          </div>
          <p className="text-xs text-muted-foreground">
            These views need fields the schema doesn&apos;t expose yet (days-to-sell,
            inventory aging, retail/market-retail). They light up when the backend adds
            them.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function formatBucketLabel(lo: number, hi: number): string {
  return `${formatMoney(lo)}–${formatMoney(hi)}`;
}
