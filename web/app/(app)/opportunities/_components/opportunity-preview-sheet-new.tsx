"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, PanelRightOpen } from "lucide-react";

import { getOpportunity } from "@/lib/app-api/client";
import type { OpportunityRow } from "@/lib/app-api/schemas";
import {
  formatOpportunityStatus,
  formatRegion,
  PAGE_COPY,
} from "@/lib/copy/opportunities-labels";
import { queryKeys } from "@/lib/query";
import { formatNumber, formatMoney, formatDateTime } from "@/lib/format";
import { ErrorState, UnavailableState } from "@/components/data-state";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Info } from "lucide-react";

import { OpportunityBadgesNew, OpportunityTypeBadgeNew } from "./opportunity-badges-new";
import { OpportunityWorkflowPanelNew } from "./opportunity-workflow-panel-new";

export function OpportunityPreviewSheetNew({
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
  const copy = PAGE_COPY.preview;

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <SheetContent
        side="right"
        className="w-full max-w-md overflow-y-auto pb-24 sm:max-w-md md:max-w-xl md:pb-6"
      >
        <SheetHeader className="space-y-3">
          <SheetTitle>{row?.title ?? "Opportunity"}</SheetTitle>
          <SheetDescription>
            {row ? [row.year, row.make, row.model].filter(Boolean).join(" ") : null}
          </SheetDescription>
          {row ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {row.listingUrl ? (
                <Button size="sm" variant="default" asChild>
                  <a href={row.listingUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" />
                    View listing
                  </a>
                </Button>
              ) : null}
              <Button size="sm" variant="outline" asChild>
                <Link href={`/opportunities/${row.id}`}>
                  <PanelRightOpen className="size-4" />
                  Open full page
                </Link>
              </Button>
            </div>
          ) : null}
        </SheetHeader>
        {row ? (
          <TooltipProvider delayDuration={300}>
            <div className="space-y-5 px-4 pb-6 text-sm">
              <section className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <OpportunityTypeBadgeNew row={row} />
                  <OpportunityBadgesNew badges={row.badges} />
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">{copy.valuationTitle}</h3>
                <dl className="space-y-2">
                  <Row label={copy.askingPrice}>{formatMoney(row.price)}</Row>
                  <Row label={copy.wholesaleValue} tooltip="MMR — Manheim Market Report wholesale estimate">
                    {formatMoney(row.mmrValue)}
                  </Row>
                  <Row label={copy.roomToMake} tooltip="Difference between asking price and wholesale value">
                    {formatMoney(row.spread)}
                  </Row>
                  <Row label={copy.dealScore} tooltip="Combined deal score from price, vehicle, and market signals">
                    {formatNumber(row.finalScore)}
                  </Row>
                  <Row label={copy.status}>{formatOpportunityStatus(row.status)}</Row>
                </dl>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">{copy.sightingTitle}</h3>
                <dl className="space-y-2">
                  <Row label={copy.source}>{row.source}</Row>
                  <Row label={copy.region}>{formatRegion(row.region)}</Row>
                  <Row label={copy.firstSeen}>{formatDateTime(row.firstSeenAt)}</Row>
                  <Row label={copy.lastSeen}>{formatDateTime(row.lastSeenAt)}</Row>
                  <Row label={copy.seenCount}>{formatNumber(row.seenCount)}</Row>
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
                  <h3 className="text-sm font-medium text-muted-foreground">{copy.detailTitle}</h3>
                  <dl className="space-y-2">
                    <Row label={copy.vin}>{detail.vin ?? "—"}</Row>
                    <Row label={copy.mileage}>{formatNumber(detail.mileage)}</Row>
                    {detail.reasonCodes.length > 0 ? (
                      <Row label={copy.reasonCodes}>{detail.reasonCodes.join(", ")}</Row>
                    ) : null}
                    {detail.valuationMissingReason ? (
                      <Row label={copy.valuationMiss}>{detail.valuationMissingReason}</Row>
                    ) : null}
                  </dl>
                </section>
              ) : null}

              <OpportunityWorkflowPanelNew
                opportunity={detail ?? row}
                actions={detail?.actions ?? []}
                recordEvaluation
              />
            </div>
          </TooltipProvider>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Row({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="inline-flex items-center gap-1 text-muted-foreground">
        {label}
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex text-muted-foreground hover:text-foreground"
                aria-label={`About ${label}`}
              >
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </dt>
      <dd className="text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}
