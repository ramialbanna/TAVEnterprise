"use client";

import { useMemo, useState } from "react";

import type { OpportunityDetail } from "@/lib/app-api/schemas";
import type { PatchOpportunityRequest } from "@/lib/app-api/client";
import {
  formatRegion,
  formatSource,
  formatVehicleLocation,
} from "@/lib/copy/opportunities-labels";
import {
  selectOptionsWithLegacy,
  VEHICLE_BODY_TYPE_OPTIONS,
  VEHICLE_ENGINE_OPTIONS,
  VEHICLE_TRANSMISSION_OPTIONS,
} from "@/lib/vehicle-attribute-options";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { MMR_COLOR_OPTIONS } from "../../mmr-lab/_components/mmr-adjustments";
import {
  applyVehicleCascadeChange,
  partitionYears,
  useVehicleCatalogOptions,
  type VehicleSelection,
} from "./use-vehicle-catalog";

const selectClass =
  "h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground " +
  "disabled:cursor-not-allowed disabled:opacity-50";

type VehicleValues = {
  vin: string;
  mileage: string;
  year: string;
  make: string;
  model: string;
  style: string;
  bodyType: string;
  engine: string;
  transmission: string;
  color: string;
};

/**
 * vAuto-style vehicle identity grid (redesign §3). Y/M/M/S use Cox catalog
 * dropdowns; body type, engine, transmission, and color use static picklists
 * (see `vehicle-attribute-options.ts`). VIN and odometer stay text inputs.
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
    (): VehicleValues => ({
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

  const vehicleSelection: VehicleSelection = {
    year: values.year,
    make: values.make,
    model: values.model,
    style: values.style,
  };
  const catalog = useVehicleCatalogOptions(vehicleSelection);
  const { recent: recentYears, older: olderYears } = partitionYears(catalog.years);
  const catalogConnected = catalog.catalogState !== "not_connected";
  const disabled = !canMutate || pending;

  const isDirty = useMemo(() => {
    return (Object.keys(initial) as (keyof VehicleValues)[]).some(
      (k) => values[k] !== initial[k],
    );
  }, [initial, values]);

  function updateField<K extends keyof VehicleValues>(key: K, value: VehicleValues[K]) {
    setValues((prev) => {
      if (key === "year" || key === "make" || key === "model" || key === "style") {
        const prevVehicle: VehicleSelection = {
          year: prev.year,
          make: prev.make,
          model: prev.model,
          style: prev.style,
        };
        const nextVehicle = applyVehicleCascadeChange(prevVehicle, {
          ...prevVehicle,
          [key]: value as string,
        });
        return { ...prev, ...nextVehicle };
      }
      return { ...prev, [key]: value };
    });
  }

  function buildPatch(): PatchOpportunityRequest {
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
    return patch;
  }

  function handleReset() {
    setValues(initial);
  }

  function handleSave() {
    const patch = buildPatch();
    if (Object.keys(patch).length > 0) onSave(patch);
  }

  function textField(
    key: "vin" | "mileage",
    label: string,
    opts?: { mono?: boolean; numeric?: boolean },
  ) {
    const id = `vehicle-${key}`;
    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
        <Input
          id={id}
          value={values[key]}
          onChange={(e) => updateField(key, e.target.value)}
          disabled={disabled}
          inputMode={opts?.numeric ? "numeric" : undefined}
          className={`h-9 ${opts?.mono ? "font-mono text-xs" : ""}`}
        />
      </div>
    );
  }

  function selectField(
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: string[],
    opts?: {
      disabled?: boolean;
      loading?: boolean;
      placeholder?: string;
      allowEmpty?: boolean;
    },
  ) {
    const isDisabled = disabled || opts?.disabled || opts?.loading;
    const placeholder =
      opts?.loading === true
        ? "Loading…"
        : opts?.placeholder ?? "Select…";

    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
        <select
          id={id}
          className={selectClass}
          value={value}
          disabled={isDisabled}
          onChange={(e) => onChange(e.target.value)}
        >
          {opts?.allowEmpty !== false ? (
            <option value="">{placeholder}</option>
          ) : null}
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  function readOnlyField(id: string, label: string, displayValue: string) {
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
          {displayValue}
        </div>
      </div>
    );
  }

  const yearOptions = selectOptionsWithLegacy(
    catalog.years.length > 0 ? catalog.years : [],
    values.year,
  );
  const savedYearNotInCatalog =
    values.year.trim() !== "" &&
    !catalog.years.some((y) => y === values.year);
  const makeOptions = selectOptionsWithLegacy(catalog.makes, values.make);
  const modelOptions = selectOptionsWithLegacy(catalog.models, values.model);
  const styleOptions = selectOptionsWithLegacy(catalog.styles, values.style);

  return (
    <div className="space-y-4">
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-status-error/30 bg-status-error-bg px-3 py-2 text-sm text-status-error">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      {!catalogConnected && catalog.reason ? (
        <p className="text-xs text-muted-foreground" role="status">
          Vehicle catalog unavailable — year/make/model/series may be limited until
          connection is restored.
        </p>
      ) : null}

      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {textField("vin", "VIN", { mono: true })}
        {textField("mileage", "Odometer (mi)", { numeric: true })}

        {(() => {
          const id = "vehicle-year";
          const isDisabled =
            disabled || catalog.loading === "years" || (!catalogConnected && yearOptions.length === 0);
          const placeholder =
            catalog.loading === "years" ? "Loading…" : "Select year";
          return (
            <div className="space-y-1">
              <Label htmlFor={id} className="text-xs text-muted-foreground">
                Year
              </Label>
              <select
                id={id}
                className={selectClass}
                value={values.year}
                disabled={isDisabled}
                onChange={(e) => updateField("year", e.target.value)}
              >
                <option value="">{placeholder}</option>
                {savedYearNotInCatalog ? (
                  <option value={values.year}>{values.year}</option>
                ) : null}
                {recentYears.length > 0 && olderYears.length > 0 ? (
                  <>
                    {recentYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                    <option disabled>──────────</option>
                    {olderYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </>
                ) : (
                  yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))
                )}
              </select>
            </div>
          );
        })()}

        {selectField("vehicle-make", "Make", values.make, (v) => updateField("make", v), makeOptions, {
          disabled: !values.year,
          loading: catalog.loading === "makes",
          placeholder: !values.year ? "Select year first" : "Select make",
        })}

        {selectField(
          "vehicle-model",
          "Model",
          values.model,
          (v) => updateField("model", v),
          modelOptions,
          {
            disabled: !values.make,
            loading: catalog.loading === "models",
            placeholder: !values.make ? "Select make first" : "Select model",
          },
        )}

        {selectField(
          "vehicle-style",
          "Series",
          values.style,
          (v) => updateField("style", v),
          styleOptions,
          {
            disabled: !values.model,
            loading: catalog.loading === "styles",
            placeholder: !values.model ? "Select model first" : "Select series",
            allowEmpty: true,
          },
        )}

        {selectField(
          "vehicle-bodyType",
          "Body type",
          values.bodyType,
          (v) => updateField("bodyType", v),
          selectOptionsWithLegacy(VEHICLE_BODY_TYPE_OPTIONS, values.bodyType),
        )}

        {selectField(
          "vehicle-engine",
          "Engine",
          values.engine,
          (v) => updateField("engine", v),
          selectOptionsWithLegacy(VEHICLE_ENGINE_OPTIONS, values.engine),
        )}

        {selectField(
          "vehicle-transmission",
          "Transmission",
          values.transmission,
          (v) => updateField("transmission", v),
          selectOptionsWithLegacy(VEHICLE_TRANSMISSION_OPTIONS, values.transmission),
        )}

        {selectField(
          "vehicle-color",
          "Color",
          values.color,
          (v) => updateField("color", v),
          selectOptionsWithLegacy(MMR_COLOR_OPTIONS, values.color),
        )}

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
