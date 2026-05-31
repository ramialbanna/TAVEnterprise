"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { ManualSubmitFormFields, useManualSubmitForm } from "./manual-submit-form";

export function ManualSubmitDialog() {
  const [open, setOpen] = useState(false);
  const formProps = useManualSubmitForm({
    loadUsers: open,
    onSuccessClose: () => setOpen(false),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="mr-2 size-4" aria-hidden />
          Submit listing
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Submit a listing</DialogTitle>
          <DialogDescription>
            Paste a marketplace link and optional vehicle facts. The listing enters the same
            Opportunities queue as automated leads.
          </DialogDescription>
        </DialogHeader>

        <ManualSubmitFormFields
          {...formProps}
          footer={
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!formProps.canSubmit}>
                {formProps.mutation.isPending ? "Submitting…" : "Submit listing"}
              </Button>
            </DialogFooter>
          }
        />
      </DialogContent>
    </Dialog>
  );
}

/** Full-page submit form for New-mode nav (`/opportunities/submit`). */
export function ManualSubmitPanel() {
  const formProps = useManualSubmitForm({ loadUsers: true });

  return (
    <ManualSubmitFormFields
      {...formProps}
      idPrefix="page"
      footer={
        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={!formProps.canSubmit}>
            {formProps.mutation.isPending ? "Submitting…" : "Submit listing"}
          </Button>
        </div>
      }
    />
  );
}
