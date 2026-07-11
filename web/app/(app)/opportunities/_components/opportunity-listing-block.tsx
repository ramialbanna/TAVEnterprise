"use client";

import type { OpportunityDetail } from "@/lib/app-api/schemas";
import { formatRegion } from "@/lib/copy/opportunities-labels";
import { formatDateTime, formatMoney, formatNumber, formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";

/**
 * Listing provenance / intake block (redesign §4). Manual-submit field parity:
 * listingUrl, source, region, asking price, submitted by, entry method, first/
 * last seen, seen count, assigned closer at submit. Read-only v1; editable
 * parity arrives in Phase 4 with the PATCH API.
 *
 * Note: `assignedCloserName` currently reflects the live workflow assignment
 * (which falls back to the manual-submission assignee). A dedicated
 * "assignee at submit" field is a Phase 4 backend addition.
 */
export function OpportunityListingBlock({
  opportunity,
}: {
  opportunity: OpportunityDetail;
}) {
  const entryMethodLabel = (() => {
    if (opportunity.entryMethod === "manual") return "Manual submit";
    if (opportunity.entryMethod === "scraper") return "Scraper";
    if (opportunity.entryMethod === "import") return "Import";
    return "—";
  })();

  return (
    <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
      <DetailRow label="Listing URL">
        {opportunity.listingUrl ? (
          <span className="inline-flex items-center gap-2">
            <a
              href={opportunity.listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              Open
            </a>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => {
                if (opportunity.listingUrl) {
                  void navigator.clipboard?.writeText(opportunity.listingUrl);
                }
              }}
            >
              Copy
            </Button>
          </span>
        ) : (
          "—"
        )}
      </DetailRow>
      <DetailRow label="Source" value={opportunity.source} />
      <DetailRow label="Region" value={formatRegion(opportunity.region)} />
      <DetailRow label="Asking price" value={formatMoney(opportunity.price)} />
      <DetailRow label="Submitted by" value={opportunity.submittedBy ?? "—"} />
      <DetailRow label="Entry method" value={entryMethodLabel} />
      <DetailRow label="Assigned closer" value={opportunity.assignedCloserName ?? "—"} />
      <DetailRow
        label="Listed"
        value={
          opportunity.postedAt
            ? `${formatRelativeTime(opportunity.postedAt)} (${formatDateTime(opportunity.postedAt)})`
            : "—"
        }
      />
      <DetailRow label="Received" value={formatDateTime(opportunity.receivedAt)} />
      <DetailRow label="First seen" value={formatDateTime(opportunity.firstSeenAt)} />
      <DetailRow label="Last seen" value={formatDateTime(opportunity.lastSeenAt)} />
      <DetailRow label="Seen count" value={formatNumber(opportunity.seenCount) ?? "—"} />
    </dl>
  );
}

function DetailRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium tabular-nums">{value ?? children}</dd>
    </div>
  );
}
