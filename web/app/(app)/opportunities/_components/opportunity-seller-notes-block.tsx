"use client";

/**
 * Phase 1 placeholder. Phase 4 wires this to sellerNotes from the opportunity
 * record + PATCH /app/opportunities/:id persistence with block-level Save.
 */
export function OpportunitySellerNotesBlock({
  initialNotes,
}: {
  initialNotes?: string | null;
}) {
  return (
    <textarea
      className="min-h-[8rem] w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      defaultValue={initialNotes ?? ""}
      maxLength={2000}
      placeholder="Seller / listing notes — editable in a later phase."
      disabled
    />
  );
}
