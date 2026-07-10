import { ExternalLink } from "lucide-react";

import type { MaxbuySummary, OpportunityRow } from "@/lib/app-api/schemas";
import { Badge } from "@/components/ui/badge";

import { OpportunityBadgesNew, OpportunityTypeBadgeNew } from "./opportunity-badges-new";

function formatMaxBuyCompact(value: number): string {
  if (value >= 1000) {
    const k = value / 1000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `$${Math.round(value)}`;
}

function MaxBuyBadge({ summary }: { summary: MaxbuySummary }) {
  const { verdict, recommendedMaxBuy } = summary;
  const label =
    verdict === "PASS"
      ? "Pass"
      : `${verdict === "STRONG_BUY" ? "Strong buy" : verdict === "BUY" ? "Buy" : "Review"} · ${formatMaxBuyCompact(recommendedMaxBuy)} max`;
  const variant: "healthy" | "review" | "neutral" =
    verdict === "STRONG_BUY" || verdict === "BUY"
      ? "healthy"
      : verdict === "REVIEW"
        ? "review"
        : "neutral";
  return (
    <Badge variant={variant} className="px-1 py-0 text-[10px] leading-4">
      {label}
    </Badge>
  );
}

export function OpportunityVehicleCellNew({
  row,
  detailHref,
}: {
  row: OpportunityRow;
  /** When set, the vehicle title is a real link (middle-click / open in new tab). */
  detailHref?: string;
}) {
  const ymm = [row.year, row.make, row.model].filter(Boolean).join(" ");
  const primary = ymm || row.title || "—";

  const showAddVinHint =
    row.entryMethod === "manual" && !row.vin && !row.maxbuySummary;

  const title = detailHref ? (
    <a
      href={detailHref}
      className="min-w-0 truncate text-foreground hover:underline"
      onClick={(event) => {
        if (!event.metaKey && !event.ctrlKey && event.button === 0) {
          event.preventDefault();
        }
      }}
    >
      {primary}
    </a>
  ) : (
    <span className="min-w-0 truncate">{primary}</span>
  );

  return (
    <div className="min-w-[10rem] space-y-1">
      <div className="flex items-center gap-1.5 font-medium leading-snug">
        {title}
        {row.listingUrl ? (
          <a
            href={row.listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted-foreground hover:text-primary"
            aria-label="View listing"
            title="View listing"
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <OpportunityTypeBadgeNew row={row} compact />
        <OpportunityBadgesNew badges={row.badges} compact />
        {row.maxbuySummary ? (
          <MaxBuyBadge summary={row.maxbuySummary} />
        ) : showAddVinHint ? (
          <span className="text-[10px] leading-4 text-muted-foreground">MaxBuy: add VIN</span>
        ) : null}
      </div>
    </div>
  );
}
