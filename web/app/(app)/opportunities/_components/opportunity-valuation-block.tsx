"use client";

import type { OpportunityDetail } from "@/lib/app-api/schemas";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

/**
 * Phase 1 read-only valuation summary. Replaces the old sparse Valuation card.
 * Phase 3 extracts a miniature MMR Lab + auto-run Max buy into this block.
 */
export function OpportunityValuationBlock({
  opportunity,
}: {
  opportunity: OpportunityDetail;
}) {
  const maxbuy = opportunity.maxbuySummary;
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid gap-3 sm:grid-cols-2">
        <DetailRow label="Asking price" value={formatMoney(opportunity.price)} />
        <DetailRow label="MMR" value={formatMoney(opportunity.mmrValue)} />
        <DetailRow label="Spread vs MMR" value={formatMoney(opportunity.spread)} />
        <DetailRow label="Deal score" value={formatNumber(opportunity.finalScore)} />
        <DetailRow label="Grade" value={opportunity.grade ?? "—"} />
        {opportunity.valuationMissingReason ? (
          <DetailRow label="Valuation miss" value={opportunity.valuationMissingReason} />
        ) : null}
      </dl>

      {maxbuy ? (
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Max buy
            </span>
            <Badge variant="outline">{maxbuy.verdict.replace("_", " ")}</Badge>
          </div>
          <dl className="grid gap-2 sm:grid-cols-2">
            <DetailRow label="Recommended" value={formatMoney(maxbuy.recommendedMaxBuy)} />
            <DetailRow label="Data strength" value={maxbuy.dataStrength} />
            <DetailRow label="Evaluated" value={formatDateTime(maxbuy.evaluatedAt)} />
          </dl>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No saved Max buy verdict — auto-run arrives in Phase 3.
        </p>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}
