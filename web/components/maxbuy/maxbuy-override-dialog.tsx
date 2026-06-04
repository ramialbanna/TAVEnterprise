"use client";

import { useState } from "react";

import type { MaxbuyOverrideType } from "@/lib/app-api/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import {
  MAXBUY_OVERRIDE_LABELS,
  MAXBUY_OVERRIDE_TYPES,
} from "./constants";

const selectClass =
  "h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground";

const textareaClass =
  "min-h-[4rem] w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type MaxbuyOverrideDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select when opened from a specific action (e.g. bid lower). */
  initialType?: MaxbuyOverrideType;
  showActedPrice?: boolean;
  pending?: boolean;
  onSubmit: (payload: {
    override_type: MaxbuyOverrideType;
    override_note?: string;
    acted_price?: number;
  }) => void;
};

export function MaxbuyOverrideDialog({
  open,
  onOpenChange,
  initialType = "other",
  showActedPrice = false,
  pending = false,
  onSubmit,
}: MaxbuyOverrideDialogProps) {
  const [overrideType, setOverrideType] = useState<MaxbuyOverrideType>(initialType);
  const [note, setNote] = useState("");
  const [actedPrice, setActedPrice] = useState("");

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setOverrideType(initialType);
      setNote("");
      setActedPrice("");
    }
    onOpenChange(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPrice = actedPrice.trim() ? Number(actedPrice.replace(/,/g, "")) : undefined;
    onSubmit({
      override_type: overrideType,
      override_note: note.trim() || undefined,
      acted_price:
        showActedPrice && parsedPrice !== undefined && Number.isFinite(parsedPrice) && parsedPrice >= 0
          ? parsedPrice
          : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Log override</DialogTitle>
            <DialogDescription>
              Structured disagreement capture — pick a reason. Optional note adds context for the
              learning loop.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="maxbuy-override-type">Reason</Label>
              <select
                id="maxbuy-override-type"
                className={selectClass}
                value={overrideType}
                onChange={(e) => setOverrideType(e.target.value as MaxbuyOverrideType)}
                required
              >
                {MAXBUY_OVERRIDE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {MAXBUY_OVERRIDE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            {showActedPrice ? (
              <div className="space-y-2">
                <Label htmlFor="maxbuy-acted-price">Bid / acted price (optional)</Label>
                <input
                  id="maxbuy-acted-price"
                  type="text"
                  inputMode="decimal"
                  className={selectClass}
                  placeholder="e.g. 15200"
                  value={actedPrice}
                  onChange={(e) => setActedPrice(e.target.value)}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="maxbuy-override-note">Note (optional)</Label>
              <textarea
                id="maxbuy-override-note"
                className={textareaClass}
                maxLength={2000}
                placeholder="Short context for managers or analytics"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save override"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
