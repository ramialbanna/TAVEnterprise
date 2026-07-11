import { ArrowDown, ArrowUp, ExternalLink, Flag, Hand } from "lucide-react";

import type { OpportunityRow } from "@/lib/app-api/schemas";
import { PAGE_COPY } from "@/lib/copy/opportunities-labels";
import { formatSpreadSignal, SPREAD_TONE_CLASS } from "@/lib/opportunities/spread-signal";
import { Button } from "@/components/ui/button";

export function OpportunityRowActionsNew({
  row,
  canClaim,
  canDismiss,
  claimPending,
  dismissPending,
  onClaim,
  onDismiss,
}: {
  row: OpportunityRow;
  canClaim: boolean;
  canDismiss: boolean;
  claimPending: boolean;
  dismissPending: boolean;
  onClaim: (row: OpportunityRow) => void;
  onDismiss: (row: OpportunityRow) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {row.listingUrl ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="View listing"
          title="View listing"
          asChild
          onClick={(event) => event.stopPropagation()}
          onAuxClick={(event) => event.stopPropagation()}
        >
          <a href={row.listingUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
      ) : null}
      {canClaim ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label={PAGE_COPY.claimAction}
          title={PAGE_COPY.claimAction}
          disabled={claimPending || dismissPending}
          onClick={(event) => {
            event.stopPropagation();
            onClaim(row);
          }}
        >
          <Hand className="size-3.5" />
        </Button>
      ) : null}
      {canDismiss ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Flag bad lead"
          title="Flag bad lead"
          disabled={dismissPending || claimPending}
          onClick={(event) => {
            event.stopPropagation();
            onDismiss(row);
          }}
        >
          <Flag className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

export function SpreadSignalCell({ spread }: { spread: number | null }) {
  const signal = formatSpreadSignal(spread);
  const Icon = signal.direction === "under" ? ArrowDown : signal.direction === "over" ? ArrowUp : null;

  return (
    <span
      className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${SPREAD_TONE_CLASS[signal.tone]}`}
    >
      {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
      {signal.text}
    </span>
  );
}
