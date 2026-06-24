"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Seller / listing notes block (redesign §6). Large read/write textarea
 * prefilled from opportunity.sellerNotes, with block-level Save. Persists via
 * PATCH /app/opportunities/:id (Phase 4).
 */
export function OpportunitySellerNotesBlock({
  initialNotes,
  onSave,
  pending,
  canMutate,
}: {
  initialNotes?: string | null;
  onSave: (notes: string | null) => void;
  pending: boolean;
  canMutate: boolean;
}) {
  const initial = initialNotes ?? "";
  const [value, setValue] = useState(initial);

  const isDirty = useMemo(() => value !== initial, [value, initial]);

  function handleSave() {
    const trimmed = value.trim();
    onSave(trimmed === "" ? null : trimmed);
  }

  function handleReset() {
    setValue(initial);
  }

  return (
    <div className="space-y-3">
      <textarea
        className="min-h-[8rem] w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={2000}
        placeholder="Seller / listing notes"
        disabled={!canMutate || pending}
      />
      {canMutate ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || pending}
          >
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleReset}
            disabled={!isDirty || pending}
          >
            Reset
          </Button>
          {isDirty ? (
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
