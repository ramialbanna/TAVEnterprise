"use client";

import { ExternalLink, Hand, PanelRightOpen } from "lucide-react";

import type { OpportunityRow } from "@/lib/app-api/schemas";
import { PAGE_COPY } from "@/lib/copy/opportunities-labels";
import { canShowClaimAction } from "@/lib/opportunities/claim-eligibility";
import { Button } from "@/components/ui/button";

export function OpportunitiesMobileActionBar({
  row,
  claimActor,
  claimPending,
  onClaim,
  onOpenDetail,
}: {
  row: OpportunityRow;
  claimActor: { id: string; displayName: string; role: "admin" | "closer" | "viewer" } | null;
  claimPending: boolean;
  onClaim: () => void;
  onOpenDetail: () => void;
}) {
  const canClaim = canShowClaimAction(claimActor, row);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 shadow-lg backdrop-blur md:hidden"
      role="toolbar"
      aria-label="Quick actions for selected deal"
    >
      <p className="mb-2 truncate text-sm font-medium">{row.title ?? "Selected deal"}</p>
      <div className="flex flex-wrap gap-2">
        {row.listingUrl ? (
          <Button size="sm" variant="outline" asChild className="flex-1 min-w-[7rem]">
            <a href={row.listingUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
              View listing
            </a>
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="flex-1 min-w-[7rem]"
          onClick={onOpenDetail}
        >
          <PanelRightOpen className="size-4" />
          Open full page
        </Button>
        {canClaim ? (
          <Button
            size="sm"
            className="flex-1 min-w-[7rem]"
            disabled={claimPending}
            onClick={onClaim}
          >
            <Hand className="size-4" />
            {PAGE_COPY.claimAction}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
