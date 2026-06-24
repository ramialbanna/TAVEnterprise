"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { addOpportunityNote } from "@/lib/app-api/client";
import { codeMessage } from "@/lib/app-api";
import { queryKeys } from "@/lib/query";
import { Button } from "@/components/ui/button";

import { OpportunityActionHistory } from "./opportunity-action-history";
import type { OpportunityAction } from "@/lib/app-api/schemas";

const textareaClass =
  "min-h-[5rem] w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function OpportunityNotesBlock({
  opportunityId,
  actions,
  canMutate,
}: {
  opportunityId: string;
  actions: OpportunityAction[];
  canMutate: boolean;
}) {
  const queryClient = useQueryClient();
  const [noteDraft, setNoteDraft] = useState("");

  const noteMutation = useMutation({
    mutationFn: (note: string) => addOpportunityNote(opportunityId, { note }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Note added");
        setNoteDraft("");
        void queryClient.invalidateQueries({ queryKey: queryKeys.opportunity(opportunityId) });
        return;
      }
      toast.error(codeMessage(result.error));
    },
  });

  if (!canMutate) return null;

  const recentNotes = actions.filter((action) => action.action === "note_added").slice(0, 3);

  return (
    <div className="space-y-3">
      <textarea
        id={`note-new-${opportunityId}`}
        className={textareaClass}
        value={noteDraft}
        onChange={(event) => setNoteDraft(event.target.value)}
        maxLength={2000}
        placeholder="Seller context, callback notes, negotiation details…"
        disabled={noteMutation.isPending}
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="secondary"
          disabled={noteMutation.isPending || noteDraft.trim().length === 0}
          onClick={() => noteMutation.mutate(noteDraft.trim())}
        >
          Save note
        </Button>
      </div>
      {recentNotes.length > 0 ? (
        <OpportunityActionHistory actions={recentNotes} emptyMessage="" />
      ) : null}
    </div>
  );
}
