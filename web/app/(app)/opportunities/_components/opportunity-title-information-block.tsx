"use client";

import { useMemo, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";

import type { OpportunityDetail } from "@/lib/app-api/schemas";
import type { PatchOpportunityRequest } from "@/lib/app-api/client";
import {
  isKnownUsStateCode,
  normalizeStoredUsState,
  US_STATES,
} from "@/lib/us-states";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useBlockAutoSave } from "./use-block-auto-save";

const selectClass =
  "h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground " +
  "disabled:cursor-not-allowed disabled:opacity-50";

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
  const blockRef = useRef<HTMLDivElement>(null);

  const initial = useMemo(
    () => ({
      titleOwner: opportunity.titleOwner ?? "",
      titleStateRegion: normalizeStoredUsState(opportunity.titleStateRegion),
      lienHolder: opportunity.lienHolder ?? "",
      lienAccountNumber: opportunity.lienAccountNumber ?? "",
      lienPayoff:
        opportunity.lienPayoff !== null && opportunity.lienPayoff !== undefined
          ? String(opportunity.lienPayoff)
          : "",
      tagOrPlate: opportunity.tagOrPlate ?? "",
      tagStateRegion: normalizeStoredUsState(opportunity.tagStateRegion),
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

  function buildPatch(): PatchOpportunityRequest {
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

  function field(
    key: keyof typeof values,
    label: string,
    opts?: { type?: string; numeric?: boolean; disabled?: boolean },
  ) {
    const id = `title-${key}`;
    const disabled = opts?.disabled || !canMutate || pending;
    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
        <Input
          id={id}
          value={String(values[key])}
          onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          disabled={disabled}
          type={opts?.type}
          inputMode={opts?.numeric ? "decimal" : undefined}
          className="h-9"
        />
      </div>
    );
  }

  function pairedCheckboxField({
    checkboxKey,
    checkboxLabel,
    fieldKey,
    fieldLabel,
    numeric,
  }: {
    checkboxKey: "certified" | "extendedWarranty";
    checkboxLabel: string;
    fieldKey: "titleOwner" | "lienPayoff";
    fieldLabel: string;
    numeric?: boolean;
  }) {
    const checkboxId = `title-${checkboxKey}`;

    return (
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          {field(fieldKey, fieldLabel, { numeric })}
        </div>
        <div className="shrink-0 pb-2">
          <label htmlFor={checkboxId} className="flex items-center gap-2 text-sm">
            <span>{checkboxLabel}</span>
            <Checkbox
              id={checkboxId}
              checked={values[checkboxKey]}
              onChange={(e) => {
                setValues((v) => ({ ...v, [checkboxKey]: e.target.checked }));
              }}
              disabled={!canMutate || pending}
            />
          </label>
        </div>
      </div>
    );
  }

  function stateField(key: "titleStateRegion" | "tagStateRegion", label: string) {
    const id = `title-${key}`;
    const current = values[key];
    const legacyValue =
      current && !isKnownUsStateCode(current) ? current : null;

    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
        <select
          id={id}
          className={selectClass}
          value={current}
          onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          disabled={!canMutate || pending}
        >
          <option value="">Select state</option>
          {legacyValue ? (
            <option value={legacyValue}>{legacyValue} (update selection)</option>
          ) : null}
          {US_STATES.map((state) => (
            <option key={state.code} value={state.code}>
              {state.name}
            </option>
          ))}
        </select>
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
        {pairedCheckboxField({
          checkboxKey: "certified",
          checkboxLabel: "Certified",
          fieldKey: "titleOwner",
          fieldLabel: "Owner",
        })}
        {stateField("titleStateRegion", "State/Region")}
        {field("lienHolder", "Lien Holder")}
        {field("lienAccountNumber", "Lien Account #")}
        {pairedCheckboxField({
          checkboxKey: "extendedWarranty",
          checkboxLabel: "Extended Warranty",
          fieldKey: "lienPayoff",
          fieldLabel: "Lien Payoff",
          numeric: true,
        })}
        {field("tagOrPlate", "Tag or Plate")}
        {stateField("tagStateRegion", "Tag State/Region")}
        {field("tagExpiration", "Tag Expiration", { type: "date" })}
      </div>
    </div>
  );
}
