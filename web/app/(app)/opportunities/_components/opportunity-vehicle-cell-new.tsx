import type { OpportunityRow } from "@/lib/app-api/schemas";

import { OpportunityBadgesNew, OpportunityTypeBadgeNew } from "./opportunity-badges-new";

export function OpportunityVehicleCellNew({ row }: { row: OpportunityRow }) {
  const ymm = [row.year, row.make, row.model].filter(Boolean).join(" ");
  const primary = ymm || row.title || "—";

  return (
    <div className="min-w-[10rem] space-y-1">
      <div className="font-medium leading-snug">{primary}</div>
      <div className="flex flex-wrap items-center gap-1">
        <OpportunityTypeBadgeNew row={row} compact />
        <OpportunityBadgesNew badges={row.badges} compact />
      </div>
    </div>
  );
}
