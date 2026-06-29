"use client";

import { useMemo, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";

import type { OpportunityDetail } from "@/lib/app-api/schemas";
import type { PatchOpportunityRequest } from "@/lib/app-api/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useBlockAutoSave } from "./use-block-auto-save";

/**
 * Salesperson / Appraisal Information block. Auto-saves on blur (item 32).
 */
export function OpportunitySalespersonAppraisalBlock({
  opportunity,
  onSave,
  pending,
  canMutate,
  error,
}: {
  opportunity: OpportunityDetail;
  onSave: (patch: PatchOpportunityRequest) => void;
  pending: boolean;
  canMutate: boolean;
  error?: string | null;
}) {
  const blockRef = useRef<HTMLDivElement>(null);

  const initial = useMemo(
    () => ({
      salesperson: opportunity.salesperson ?? "",
      appraiser: opportunity.appraiser ?? "",
    }),
    [opportunity],
  );

  const [values, setValues] = useState(initial);

  const isDirty = useMemo(() => {
    return (Object.keys(initial) as (keyof typeof initial)[]).some(
      (k) => values[k] !== initial[k],
    );
  }, [initial, values]);

  function buildPatch(): PatchOpportunityRequest {
    const patch: PatchOpportunityRequest = {};
    if (values.salesperson !== initial.salesperson)
      patch.salesperson = values.salesperson.trim() || null;
    if (values.appraiser !== initial.appraiser)
      patch.appraiser = values.appraiser.trim() || null;
    return patch;
  }

  function persistIfDirty() {
    const patch = buildPatch();
    if (Object.keys(patch).length > 0) onSave(patch);
  }

  const { handleBlur } = useBlockAutoSave({
    blockRef,
    isDirty,
    canSave: canMutate,
    pending,
    onSave: persistIfDirty,
  });

  function field(key: keyof typeof values, label: string) {
    const id = `appraisal-${key}`;
    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
        <Input
          id={id}
          value={values[key]}
          onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          disabled={!canMutate || pending}
          className="h-9"
        />
      </div>
    );
  }

  return (
    <div ref={blockRef} className="space-y-4" onBlur={handleBlur}>
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-status-error/30 bg-status-error-bg px-3 py-2 text-sm text-status-error">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {field("salesperson", "Salesperson")}
        {field("appraiser", "Appraiser")}
      </div>
    </div>
  );
}
