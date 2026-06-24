"use client";

import type { OpportunityDetail } from "@/lib/app-api/schemas";
import { formatNumber } from "@/lib/format";
import { formatRegion } from "@/lib/copy/opportunities-labels";

/**
 * vAuto-style vehicle identity grid (redesign §3). Two-column field grid inside
 * the block. All fields will become editable in Phase 4 (block-level Save +
 * PATCH API); Phase 1/2 renders them read-only.
 *
 * Fields without a backend column yet (body type, engine, transmission, color)
 * surface as `—` until Phase 4 persists them. Region is shown here as the
 * valuation-relevant field; the Listing block shows it as provenance.
 */
export function OpportunityVehicleBlock({
  opportunity,
}: {
  opportunity: OpportunityDetail;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
      <DetailRow label="VIN" value={opportunity.vin ?? "—"} mono />
      <DetailRow
        label="Odometer"
        value={opportunity.mileage != null ? `${formatNumber(opportunity.mileage)} mi` : "—"}
      />
      <DetailRow
        label="Year"
        value={opportunity.year != null ? String(opportunity.year) : "—"}
      />
      <DetailRow label="Make" value={opportunity.make ?? "—"} />
      <DetailRow label="Model" value={opportunity.model ?? "—"} />
      <DetailRow label="Series" value={opportunity.style ?? "—"} />
      <DetailRow label="Body type" value="—" />
      <DetailRow label="Engine" value="—" />
      <DetailRow label="Transmission" value="—" />
      <DetailRow label="Color" value="—" />
      <DetailRow label="Region" value={formatRegion(opportunity.region)} />
    </dl>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={`text-right text-sm font-medium tabular-nums ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
