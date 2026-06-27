"use client";

import { useMemo, useState } from "react";

import type { OpportunityDetail } from "@/lib/app-api/schemas";
import type { PatchOpportunityRequest } from "@/lib/app-api/client";
import {
  formatRegion,
  formatSource,
  formatVehicleLocation,
} from "@/lib/copy/opportunities-labels";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * vAuto-style vehicle identity grid (redesign §3). Two-column editable field
 * grid with block-level Save. Valuation-affecting fields (VIN, odometer, year,
 * make, model, series, color) trigger MMR/Max buy refresh on save via the
 * parent's query invalidation. Region is read-only provenance.
 */
export function OpportunityVehicleBlock({
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
      vin: opportunity.vin ?? "",
      mileage: opportunity.mileage != null ? String(opportunity.mileage) : "",
      year: opportunity.year != null ? String(opportunity.year) : "",
      make: opportunity.make ?? "",
      model: opportunity.model ?? "",
      style: opportunity.style ?? "",
      bodyType: opportunity.bodyType ?? "",
      engine: opportunity.engine ?? "",
      transmission: opportunity.transmission ?? "",
      color: opportunity.color ?? "",
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
    if (values.vin !== initial.vin) patch.vin = values.vin.trim() || null;
    if (values.mileage !== initial.mileage) {
      const n = Number(values.mileage);
      patch.mileage = values.mileage === "" || !Number.isFinite(n) ? null : Math.round(n);
    }
    if (values.year !== initial.year) {
      const n = Number(values.year);
      patch.year = values.year === "" || !Number.isFinite(n) ? null : Math.round(n);
    }
    if (values.make !== initial.make) patch.make = values.make.trim() || null;
    if (values.model !== initial.model) patch.model = values.model.trim() || null;
    if (values.style !== initial.style) patch.style = values.style.trim() || null;
    if (values.bodyType !== initial.bodyType) patch.bodyType = values.bodyType.trim() || null;
    if (values.engine !== initial.engine) patch.engine = values.engine.trim() || null;
    if (values.transmission !== initial.transmission)
      patch.transmission = values.transmission.trim() || null;
    if (values.color !== initial.color) patch.color = values.color.trim() || null;
    onSave(patch);
  }

  function field(key: keyof typeof values, label: string, opts?: { mono?: boolean; numeric?: boolean }) {
    const id = `vehicle-${key}`;
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
          inputMode={opts?.numeric ? "numeric" : undefined}
          className={`h-9 ${opts?.mono ? "font-mono text-xs" : ""}`}
        />
      </div>
    );
  }

  function readOnlyField(id: string, label: string, value: string) {
    return (
      <div className="space-y-1">
        <Label id={`${id}-label`} className="text-xs text-muted-foreground">
          {label}
        </Label>
        <div
          id={id}
          aria-labelledby={`${id}-label`}
          className="flex h-9 items-center text-sm text-muted-foreground"
        >
          {value}
        </div>
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
        {field("vin", "VIN", { mono: true })}
        {field("mileage", "Odometer (mi)", { numeric: true })}
        {field("year", "Year", { numeric: true })}
        {field("make", "Make")}
        {field("model", "Model")}
        {field("style", "Series")}
        {field("bodyType", "Body type")}
        {field("engine", "Engine")}
        {field("transmission", "Transmission")}
        {field("color", "Color")}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Region</Label>
          <div className="flex h-9 items-center text-sm text-muted-foreground">
            {formatRegion(opportunity.region)}
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-foreground">Additional Information</h3>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {readOnlyField(
            "vehicle-location",
            "Location",
            formatVehicleLocation(opportunity),
          )}
          {readOnlyField("vehicle-source", "Source", formatSource(opportunity.source))}
        </div>
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
