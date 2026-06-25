"use client";

import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";

import type { OpportunityDetail } from "@/lib/app-api/schemas";
import type { PatchOpportunityRequest } from "@/lib/app-api/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Title Information block — right side of the Salesperson/Appraisal row.
 * Editable grid of title/lien/tag fields plus Certified and Extended
 * Warranty checkboxes. Persists via PATCH /app/opportunities/:id.
 *
 * `tagExpiration` is stored as a Postgres `date` (YYYY-MM-DD); the native
 * date input reads/writes that format directly.
 */
export function OpportunityTitleInformationBlock({
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
  const initial = useMemo(
    () => ({
      titleOwner: opportunity.titleOwner ?? "",
      titleStateRegion: opportunity.titleStateRegion ?? "",
      lienHolder: opportunity.lienHolder ?? "",
      lienAccountNumber: opportunity.lienAccountNumber ?? "",
      lienPayoff:
        opportunity.lienPayoff !== null && opportunity.lienPayoff !== undefined
          ? String(opportunity.lienPayoff)
          : "",
      tagOrPlate: opportunity.tagOrPlate ?? "",
      tagStateRegion: opportunity.tagStateRegion ?? "",
      tagExpiration: opportunity.tagExpiration ?? "",
      certified: opportunity.certified ?? false,
      extendedWarranty: opportunity.extendedWarranty ?? false,
    }),
    [opportunity],
  );

  const [values, setValues] = useState(initial);

  const isDirty = useMemo(() => {
    return (Object.keys(initial) as (keyof typeof initial)[]).some(
      (k) => values[k] !== initial[k],
    );
  }, [initial, values]);

  function handleReset() {
    setValues(initial);
  }

  function handleSave() {
    const patch: PatchOpportunityRequest = {};
    if (values.titleOwner !== initial.titleOwner)
      patch.titleOwner = values.titleOwner.trim() || null;
    if (values.titleStateRegion !== initial.titleStateRegion)
      patch.titleStateRegion = values.titleStateRegion.trim() || null;
    if (values.lienHolder !== initial.lienHolder)
      patch.lienHolder = values.lienHolder.trim() || null;
    if (values.lienAccountNumber !== initial.lienAccountNumber)
      patch.lienAccountNumber = values.lienAccountNumber.trim() || null;
    if (values.lienPayoff !== initial.lienPayoff) {
      const n = Number(values.lienPayoff);
      patch.lienPayoff = values.lienPayoff === "" || !Number.isFinite(n) ? null : n;
    }
    if (values.tagOrPlate !== initial.tagOrPlate)
      patch.tagOrPlate = values.tagOrPlate.trim() || null;
    if (values.tagStateRegion !== initial.tagStateRegion)
      patch.tagStateRegion = values.tagStateRegion.trim() || null;
    if (values.tagExpiration !== initial.tagExpiration)
      patch.tagExpiration = values.tagExpiration.trim() || null;
    if (values.certified !== initial.certified) patch.certified = values.certified;
    if (values.extendedWarranty !== initial.extendedWarranty)
      patch.extendedWarranty = values.extendedWarranty;
    onSave(patch);
  }

  function field(
    key: keyof typeof values,
    label: string,
    opts?: { type?: string; numeric?: boolean },
  ) {
    const id = `title-${key}`;
    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
        <Input
          id={id}
          value={String(values[key])}
          onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          disabled={!canMutate || pending}
          type={opts?.type}
          inputMode={opts?.numeric ? "decimal" : undefined}
          className="h-9"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-status-error/30 bg-status-error-bg px-3 py-2 text-sm text-status-error">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {field("titleOwner", "Owner")}
        {field("titleStateRegion", "State/Region")}
        {field("lienHolder", "Lien Holder")}
        {field("lienAccountNumber", "Lien Account #")}
        {field("lienPayoff", "Lien Payoff", { numeric: true })}
        {field("tagOrPlate", "Tag or Plate")}
        {field("tagStateRegion", "Tag State/Region")}
        {field("tagExpiration", "Tag Expiration", { type: "date" })}
      </div>

      <div className="flex flex-wrap items-center gap-6 pt-1">
        <label htmlFor="title-certified" className="flex items-center gap-2 text-sm">
          <Checkbox
            id="title-certified"
            checked={values.certified}
            onChange={(e) => setValues((v) => ({ ...v, certified: e.target.checked }))}
            disabled={!canMutate || pending}
          />
          <span>Certified</span>
        </label>
        <label
          htmlFor="title-extended-warranty"
          className="flex items-center gap-2 text-sm"
        >
          <Checkbox
            id="title-extended-warranty"
            checked={values.extendedWarranty}
            onChange={(e) =>
              setValues((v) => ({ ...v, extendedWarranty: e.target.checked }))
            }
            disabled={!canMutate || pending}
          />
          <span>Extended Warranty</span>
        </label>
      </div>

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
