"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { getOpportunity } from "@/lib/app-api/client";
import type { OpportunityRow } from "@/lib/app-api/schemas";
import { queryKeys } from "@/lib/query";
import { formatNumber, formatMoney, formatDateTime } from "@/lib/format";
import { ErrorState, UnavailableState } from "@/components/data-state";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { OpportunityBadges, OpportunityTypeBadge } from "./opportunity-badges";

export function OpportunityPreviewSheet({
  row,
  onClose,
}: {
  row: OpportunityRow | null;
  onClose: () => void;
}) {
  const open = row !== null;
  const query = useQuery({
    queryKey: row ? queryKeys.opportunity(row.id) : ["opportunity", "none"],
    queryFn: () => getOpportunity(row!.id),
    enabled: open,
  });

  const detail = query.data?.ok ? query.data.data : null;

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <SheetContent
        side="right"
        className="w-full max-w-md sm:max-w-md md:max-w-xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>{row?.title ?? "Opportunity"}</SheetTitle>
          <SheetDescription>
            {row ? [row.year, row.make, row.model].filter(Boolean).join(" ") : null}
          </SheetDescription>
        </SheetHeader>
        {row ? (
          <div className="space-y-5 px-4 pb-6 text-sm">
            <section className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <OpportunityTypeBadge row={row} />
                <OpportunityBadges badges={row.badges} />
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Valuation
              </h3>
              <dl className="space-y-2">
                <Row label="Asking price">{formatMoney(row.price)}</Row>
                <Row label="MMR">{formatMoney(row.mmrValue)}</Row>
                <Row label="Spread vs MMR">{formatMoney(row.spread)}</Row>
                <Row label="Score">{formatNumber(row.finalScore)}</Row>
                <Row label="Status">{row.status ?? "—"}</Row>
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Sighting
              </h3>
              <dl className="space-y-2">
                <Row label="Source">{row.source}</Row>
                <Row label="Region">{row.region ?? "—"}</Row>
                <Row label="First seen">{formatDateTime(row.firstSeenAt)}</Row>
                <Row label="Last seen">{formatDateTime(row.lastSeenAt)}</Row>
                <Row label="Seen count">{formatNumber(row.seenCount)}</Row>
              </dl>
            </section>

            {query.data === undefined ? (
              <p className="text-muted-foreground">Loading detail…</p>
            ) : !query.data.ok ? (
              query.data.kind === "unavailable" ? (
                <UnavailableState code={query.data.error} title="Detail unavailable" />
              ) : (
                <ErrorState error={query.data} onRetry={() => void query.refetch()} />
              )
            ) : detail ? (
              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Detail
                </h3>
                <dl className="space-y-2">
                  <Row label="VIN">{detail.vin ?? "—"}</Row>
                  <Row label="Mileage">{formatNumber(detail.mileage)}</Row>
                  {detail.reasonCodes.length > 0 ? (
                    <Row label="Reason codes">{detail.reasonCodes.join(", ")}</Row>
                  ) : null}
                  {detail.valuationMissingReason ? (
                    <Row label="Valuation miss">{detail.valuationMissingReason}</Row>
                  ) : null}
                </dl>
              </section>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-2">
              {row.listingUrl ? (
                <a
                  href={row.listingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-primary underline underline-offset-2"
                >
                  Open listing
                </a>
              ) : null}
              <Link
                href={`/opportunities/${row.id}`}
                className="text-xs font-medium text-primary underline underline-offset-2"
              >
                Full detail page
              </Link>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}
