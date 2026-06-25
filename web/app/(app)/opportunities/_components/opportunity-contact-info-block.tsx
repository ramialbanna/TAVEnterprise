"use client";

import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";

import type { OpportunityDetail } from "@/lib/app-api/schemas";
import type { PatchOpportunityRequest } from "@/lib/app-api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Contact info block — right side of the hero row (redesign follow-up).
 * Editable 2-column grid of seller contact fields with block-level Save.
 * Persists via PATCH /app/opportunities/:id.
 */
export function OpportunityContactInfoBlock({
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
      contactFirstName: opportunity.contactFirstName ?? "",
      contactLastName: opportunity.contactLastName ?? "",
      contactHomePhone: opportunity.contactHomePhone ?? "",
      contactEmail: opportunity.contactEmail ?? "",
      contactAddress: opportunity.contactAddress ?? "",
      contactPostalCode: opportunity.contactPostalCode ?? "",
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
    if (values.contactFirstName !== initial.contactFirstName)
      patch.contactFirstName = values.contactFirstName.trim() || null;
    if (values.contactLastName !== initial.contactLastName)
      patch.contactLastName = values.contactLastName.trim() || null;
    if (values.contactHomePhone !== initial.contactHomePhone)
      patch.contactHomePhone = values.contactHomePhone.trim() || null;
    if (values.contactEmail !== initial.contactEmail)
      patch.contactEmail = values.contactEmail.trim() || null;
    if (values.contactAddress !== initial.contactAddress)
      patch.contactAddress = values.contactAddress.trim() || null;
    if (values.contactPostalCode !== initial.contactPostalCode)
      patch.contactPostalCode = values.contactPostalCode.trim() || null;
    onSave(patch);
  }

  function field(key: keyof typeof values, label: string, opts?: { type?: string }) {
    const id = `contact-${key}`;
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
          type={opts?.type}
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
        {field("contactFirstName", "First Name")}
        {field("contactLastName", "Last Name")}
        {field("contactHomePhone", "Home Phone", { type: "tel" })}
        {field("contactEmail", "Email", { type: "email" })}
        {field("contactAddress", "Address")}
        {field("contactPostalCode", "Postal Code")}
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
