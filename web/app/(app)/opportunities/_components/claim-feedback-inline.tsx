"use client";

import { Check } from "lucide-react";

import type { OpportunityRow } from "@/lib/app-api/schemas";
import { PAGE_COPY } from "@/lib/copy/opportunities-labels";
import { formatClaimCountdown } from "@/lib/opportunities/workflow-steps";

/** Inline confirmation after a successful claim (New mode). */
export function ClaimFeedbackInline({
  row,
  onDismiss,
}: {
  row: OpportunityRow;
  onDismiss: () => void;
}) {
  const countdown = formatClaimCountdown(row.claimExpiresAt);
  const vehicle = [row.year, row.make, row.model].filter(Boolean).join(" ") || row.title;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm"
    >
      <div className="flex items-start gap-2">
        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div>
          <p className="font-medium text-foreground">
            {PAGE_COPY.claimAction} — {vehicle}
          </p>
          {countdown ? (
            <p className="text-xs text-muted-foreground">{countdown}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Your 24-hour working window is active.</p>
          )}
        </div>
      </div>
      <button
        type="button"
        className="text-xs font-medium text-primary hover:underline"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  );
}
