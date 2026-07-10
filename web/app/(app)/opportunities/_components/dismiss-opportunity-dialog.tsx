"use client";

import { useState } from "react";

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
  DISMISS_REASON_CODES,
  DISMISS_REASON_LABELS,
  type DismissReasonCode,
} from "@/lib/opportunities/dismiss-reasons";

const textareaClass =
  "min-h-[4rem] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type DismissOpportunityDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleLabel?: string | null;
  pending?: boolean;
  onSubmit: (payload: { reason: DismissReasonCode; notes?: string }) => void;
};

export function DismissOpportunityDialog({
  open,
  onOpenChange,
  vehicleLabel,
  pending = false,
  onSubmit,
}: DismissOpportunityDialogProps) {
  const [reason, setReason] = useState<DismissReasonCode | "">("");
  const [notes, setNotes] = useState("");

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setReason("");
      setNotes("");
    }
    onOpenChange(next);
  };

  const notesRequired = reason === "other";
  const notesOk = !notesRequired || notes.trim().length >= 3;
  const canSubmit = reason !== "" && notesOk && !pending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason === "" || !notesOk || pending) return;
    onSubmit({
      reason,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Flag bad lead</DialogTitle>
            <DialogDescription>
              {vehicleLabel
                ? `Remove “${vehicleLabel}” from everyone’s active queue. Pick why.`
                : "Remove this lead from everyone’s active queue. Pick why."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">Reason</legend>
              <div className="space-y-2">
                {DISMISS_REASON_CODES.map((code) => (
                  <label
                    key={code}
                    className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                  >
                    <input
                      type="radio"
                      name="dismiss-reason"
                      value={code}
                      checked={reason === code}
                      onChange={() => setReason(code)}
                      className="size-4 accent-foreground"
                      required
                    />
                    {DISMISS_REASON_LABELS[code]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="dismiss-notes">
                Note{notesRequired ? " (required)" : " (optional)"}
              </Label>
              <textarea
                id="dismiss-notes"
                className={textareaClass}
                maxLength={2000}
                placeholder={notesRequired ? "Briefly explain" : "Optional detail"}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                required={notesRequired}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {pending ? "Flagging…" : "Flag bad lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
