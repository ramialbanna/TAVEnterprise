import Link from "next/link";
import type { ReactNode } from "react";

import { formatMoney, formatNumber } from "@/lib/format";
import type { OpportunityDetail } from "@/lib/app-api/schemas";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { OpportunityBadges, OpportunityTypeBadge } from "./opportunity-badges";
import { OpportunityContactInfoBlock } from "./opportunity-contact-info-block";
import { OpportunityProvenanceBlock } from "./opportunity-provenance-block";
import type { PatchOpportunityRequest } from "@/lib/app-api/client";

function formatVehicleLine(opp: OpportunityDetail): string {
  const ymm = [opp.year, opp.make, opp.model, opp.style].filter(Boolean).join(" ");
  const price = opp.price !== null ? formatMoney(opp.price) : null;
  const miles =
    opp.mileage !== null
      ? `${formatNumber(opp.mileage)} mi`
      : opp.badges.includes("Mileage unknown")
        ? "Mileage unknown"
        : null;
  const source = opp.source ? opp.source.replace(/_/g, " ") : null;
  return [ymm, price, miles, source].filter(Boolean).join(" · ");
}

/**
 * Detail hero per redesign §1. Two-column layout: hero content (title,
 * one-liner, badges, primary actions) on the left, editable Contact Info
 * block on the right. Badges appear here only — not duplicated elsewhere.
 */
export function OpportunityDetailHero({
  opportunity,
  contactBlockKey,
  primaryAction,
  secondaryActions,
  onSaveContact,
  patchPending,
  canMutate,
  patchError,
}: {
  opportunity: OpportunityDetail;
  contactBlockKey?: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode[];
  onSaveContact: (patch: PatchOpportunityRequest) => void;
  patchPending: boolean;
  canMutate: boolean;
  patchError?: string | null;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="overflow-hidden border-border bg-card">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="space-y-2">
            <Link
              href="/opportunities"
              className="text-xs font-medium text-primary underline underline-offset-2"
            >
              ← Back to queue
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">{opportunity.title}</h1>
            <p className="text-base font-medium text-foreground">{formatVehicleLine(opportunity)}</p>
            <OpportunityProvenanceBlock opportunity={opportunity} />
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <OpportunityTypeBadge row={opportunity} />
              <OpportunityBadges badges={opportunity.badges} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {opportunity.listingUrl ? (
              <Button variant="outline" size="sm" asChild>
                <a href={opportunity.listingUrl} target="_blank" rel="noopener noreferrer">
                  Open listing
                </a>
              </Button>
            ) : null}
            {primaryAction}
            {secondaryActions}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardContent className="p-5 sm:p-6">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Contact Information</h2>
          <OpportunityContactInfoBlock
            key={contactBlockKey}
            opportunity={opportunity}
            onSave={onSaveContact}
            pending={patchPending}
            canMutate={canMutate}
            error={patchError}
          />
        </CardContent>
      </Card>
    </div>
  );
}
