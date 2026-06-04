"use client";

import { useEffect, useState } from "react";

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
  MAXBUY_PASS_REASON_LABELS,
  MAXBUY_PASS_REASONS,
  type MaxbuyPassReason,
} from "./constants";

const selectClass =
  "h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground";

const textareaClass =
  "min-h-[4rem] w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type MaxbuyPassDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialReason?: MaxbuyPassReason;
  pending?: boolean;
  onSubmit: (payload: { pass_reason: MaxbuyPassReason; pass_note?: string }) => void;
};

export function MaxbuyPassDialog({
  open,
  onOpenChange,
  initialReason = "other",
  pending = false,
  onSubmit,
}: MaxbuyPassDialogProps) {
  const [passReason, setPassReason] = useState<MaxbuyPassReason>(initialReason);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setPassReason(initialReason);
      setNote("");
    }
  }, [open, initialReason]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      pass_reason: passReason,
      pass_note: note.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Log pass</DialogTitle>
            <DialogDescription>
              You are passing on this vehicle after a Max buy evaluation. Pick a structured reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="maxbuy-pass-reason">Pass reason</Label>
              <select
                id="maxbuy-pass-reason"
                className={selectClass}
                value={passReason}
                onChange={(e) => setPassReason(e.target.value as MaxbuyPassReason)}
                required
              >
                {MAXBUY_PASS_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {MAXBUY_PASS_REASON_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxbuy-pass-note">Note (optional)</Label>
              <textarea
                id="maxbuy-pass-note"
                className={textareaClass}
                maxLength={2000}
                placeholder="Optional detail"
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
              {pending ? "Saving…" : "Log pass"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
