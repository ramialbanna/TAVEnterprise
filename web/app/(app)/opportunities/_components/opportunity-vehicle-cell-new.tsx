import { ExternalLink } from "lucide-react";

import type { OpportunityRow } from "@/lib/app-api/schemas";

import { OpportunityBadgesNew, OpportunityTypeBadgeNew } from "./opportunity-badges-new";

export function OpportunityVehicleCellNew({ row }: { row: OpportunityRow }) {
  const ymm = [row.year, row.make, row.model].filter(Boolean).join(" ");
  const primary = ymm || row.title || "—";

  return (
    <div className="min-w-[10rem] space-y-1">
      <div className="flex items-center gap-1.5 font-medium leading-snug">
        <span className="min-w-0 truncate">{primary}</span>
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
      </div>
    </div>
  );
}
