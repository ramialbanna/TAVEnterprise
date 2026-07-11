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
  decodeVinToVehicleSelection,
  isDecodableVin,
  normalizeOpportunityVin,
} from "./decode-vin-to-vehicle";
import {
  applyVehicleCascadeChange,
  buildMmrLabPrefillHref,
  matchCatalogOption,
  partitionYears,
  resolveListingToCatalog,
  useVehicleCatalogOptions,
  type ListingCatalogResolution,
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

function mileageFromValues(values: VehicleValues): number | null {
  if (values.mileage === "") return null;
  const n = Number(values.mileage);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function shouldAttemptVinDecode(values: VehicleValues, initial: VehicleValues): boolean {
  const vin = normalizeOpportunityVin(values.vin);
  if (!isDecodableVin(vin)) return false;
  const vinChanged = vin !== normalizeOpportunityVin(initial.vin);
  const ymmIncomplete = !values.make.trim() || !values.model.trim();
  return vinChanged || ymmIncomplete;
}

/**
 * vAuto-style vehicle identity grid (redesign §3). Y/M/M/S use Cox catalog
 * dropdowns; body type, engine, transmission, and color use static picklists
 * (see `vehicle-attribute-options.ts`). VIN and odometer stay text inputs.
 *
 * VIN save/blur (NEXT_STEPS #48): decode → catalog Y/M/M/S → persist via Save.
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
  const [decoding, setDecoding] = useState(false);
  const [saveInFlight, setSaveInFlight] = useState(false);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [fromVin, setFromVin] = useState(false);
  const [listingMatch, setListingMatch] = useState<ListingCatalogResolution | null>(null);
  const [listingApplying, setListingApplying] = useState(false);
  const [listingError, setListingError] = useState<string | null>(null);

  const vehicleSelection: VehicleSelection = {
    year: values.year,
    make: values.make,
    model: values.model,
    style: values.style,
  };
  const catalog = useVehicleCatalogOptions(vehicleSelection);
  const { recent: recentYears, older: olderYears } = partitionYears(catalog.years);
  const catalogConnected = catalog.catalogState !== "not_connected";

  // Item 54 / 46: map listing free-text (honda) onto Cox catalog tokens (Honda)
  // so <select> values match options. Do not run cascade — casing-only updates
  // must not clear model/style.
  const matchedMake = matchCatalogOption(catalog.makes, values.make);
  const matchedModel = matchCatalogOption(catalog.models, values.model);
  const matchedStyle = matchCatalogOption(catalog.styles, values.style);
  if (
    (matchedMake != null && matchedMake !== values.make) ||
    (matchedModel != null && matchedModel !== values.model) ||
    (matchedStyle != null && matchedStyle !== values.style)
  ) {
    setValues((prev) => ({
      ...prev,
      make: matchCatalogOption(catalog.makes, prev.make) ?? prev.make,
      model: matchCatalogOption(catalog.models, prev.model) ?? prev.model,
      style: matchCatalogOption(catalog.styles, prev.style) ?? prev.style,
    }));
  }

  // Do not disable Save while blur-decode runs — userEvent/closer click-after-blur
  // would hit a disabled button and never PATCH (#49 regression with #48).
  const disabled = !canMutate || pending || saveInFlight;

  const isDirty = useMemo(() => {
    return (Object.keys(initial) as (keyof VehicleValues)[]).some(
      (k) => values[k] !== initial[k],
    );
  }, [initial, values]);

  function updateField<K extends keyof VehicleValues>(key: K, value: VehicleValues[K]) {
    if (
      key === "vin" ||
      key === "year" ||
      key === "make" ||
      key === "model" ||
      key === "style"
    ) {
      setDecodeError(null);
      setFromVin(false);
      setListingMatch(null);
      setListingError(null);
    }
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

  function buildPatchFrom(next: VehicleValues): PatchOpportunityRequest {
    const patch: PatchOpportunityRequest = {};
    if (next.vin !== initial.vin) patch.vin = next.vin.trim() || null;
    if (next.mileage !== initial.mileage) {
      const n = Number(next.mileage);
      patch.mileage = next.mileage === "" || !Number.isFinite(n) ? null : Math.round(n);
    }
    if (next.year !== initial.year) {
      const n = Number(next.year);
      patch.year = next.year === "" || !Number.isFinite(n) ? null : Math.round(n);
    }
    if (next.make !== initial.make) patch.make = next.make.trim() || null;
    if (next.model !== initial.model) patch.model = next.model.trim() || null;
    if (next.style !== initial.style) patch.style = next.style.trim() || null;
    if (next.bodyType !== initial.bodyType) patch.bodyType = next.bodyType.trim() || null;
    if (next.engine !== initial.engine) patch.engine = next.engine.trim() || null;
    if (next.transmission !== initial.transmission)
      patch.transmission = next.transmission.trim() || null;
    if (next.color !== initial.color) patch.color = next.color.trim() || null;
    return patch;
  }

  async function applyVinDecode(nextValues: VehicleValues): Promise<VehicleValues> {
    if (!shouldAttemptVinDecode(nextValues, initial)) {
      return nextValues;
    }

    setDecoding(true);
    setDecodeError(null);
    try {
      const result = await decodeVinToVehicleSelection(nextValues.vin, {
        mileage: mileageFromValues(nextValues),
        catalogYears: catalog.years,
      });

      if (!result.ok) {
        setDecodeError(result.error);
        setFromVin(false);
        // Keep VIN + existing YMM; normalize VIN casing in the field.
        const normalized = normalizeOpportunityVin(nextValues.vin);
        return normalized === nextValues.vin
          ? nextValues
          : { ...nextValues, vin: normalized };
      }

      setFromVin(true);
      setDecodeError(null);
      return {
        ...nextValues,
        vin: normalizeOpportunityVin(nextValues.vin),
        year: result.selection.year,
        make: result.selection.make,
        model: result.selection.model,
        style: result.selection.style,
      };
    } catch {
      // Never block VIN PATCH on an unexpected decode failure (#49 / #48).
      setDecodeError("VIN decode failed — VIN will still be saved.");
      setFromVin(false);
      const normalized = normalizeOpportunityVin(nextValues.vin);
      return normalized === nextValues.vin
        ? nextValues
        : { ...nextValues, vin: normalized };
    } finally {
      setDecoding(false);
    }
  }

  function handleReset() {
    setValues(initial);
    setDecodeError(null);
    setFromVin(false);
    setListingMatch(null);
    setListingError(null);
  }

  async function handleUseListingIdentity() {
    if (!canMutate || pending || saveInFlight || listingApplying) return;
    if (opportunity.year == null || !opportunity.make?.trim() || !opportunity.model?.trim()) {
      setListingError("Listing needs year, make, and model before catalog match.");
      return;
    }

    setListingApplying(true);
    setListingError(null);
    setDecodeError(null);
    try {
      const resolved = await resolveListingToCatalog({
        year: opportunity.year,
        make: opportunity.make,
        model: opportunity.model,
        style: opportunity.style,
        title: opportunity.title,
      });

      if (!resolved.selection.year || !resolved.selection.make || !resolved.selection.model) {
        setListingError(
          `No Cox catalog match for listing — said “${opportunity.make} ${opportunity.model}”. Pick from the dropdowns.`,
        );
        setListingMatch(resolved);
        return;
      }

      const next: VehicleValues = {
        ...values,
        year: resolved.selection.year,
        make: resolved.selection.make,
        model: resolved.selection.model,
        style: resolved.selection.style,
      };
      setValues(next);
      setFromVin(false);
      setListingMatch(resolved);

      const patch = buildPatchFrom(next);
      // Always persist resolved identity so valuation remounts even when casing-only.
      const forcePatch: PatchOpportunityRequest = {
        ...patch,
        year: Number(resolved.selection.year),
        make: resolved.selection.make,
        model: resolved.selection.model,
        style: resolved.selection.style || null,
      };
      onSave(forcePatch);
    } catch {
      setListingError("Could not match listing identity to the Cox catalog.");
    } finally {
      setListingApplying(false);
    }
  }

  async function handleSave() {
    if (saveInFlight || pending || !canMutate) return;
    setSaveInFlight(true);
    try {
      const decoded = await applyVinDecode(values);
      if (decoded !== values) {
        setValues(decoded);
      }
      const patch = buildPatchFrom(decoded);
      if (Object.keys(patch).length > 0) onSave(patch);
    } finally {
      setSaveInFlight(false);
    }
  }

  async function handleVinBlur() {
    if (!canMutate || pending || saveInFlight || decoding) return;
    if (!shouldAttemptVinDecode(values, initial)) return;

    const decoded = await applyVinDecode(values);
    if (decoded !== values) {
      setValues(decoded);
    }
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
          onBlur={key === "vin" ? () => void handleVinBlur() : undefined}
          disabled={disabled}
          inputMode={opts?.numeric ? "numeric" : undefined}
          className={`h-9 ${opts?.mono ? "font-mono text-xs" : ""}`}
          autoComplete={key === "vin" ? "off" : undefined}
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
  const displayError = decodeError ?? listingError ?? error;
  const canApplyListing =
    canMutate &&
    catalogConnected &&
    opportunity.year != null &&
    !!opportunity.make?.trim() &&
    !!opportunity.model?.trim();
  const mmrLabHref = buildMmrLabPrefillHref({
    vin: values.vin || opportunity.vin,
    selection: {
      year: values.year,
      make: values.make,
      model: values.model,
      style: values.style,
    },
  });
  const listingDiffParts = listingMatch
    ? (Object.entries(listingMatch.changedFields) as [
        keyof typeof listingMatch.changedFields,
        { from: string; to: string },
      ][])
        .filter(([, change]) => change != null)
        .map(([field, change]) => `${field}: “${change!.from}” → “${change!.to}”`)
    : [];

  return (
    <div className="space-y-4">
      {displayError ? (
        <div className="flex items-start gap-2 rounded-md border border-status-error/30 bg-status-error-bg px-3 py-2 text-sm text-status-error">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{displayError}</span>
        </div>
      ) : null}

      {fromVin ? (
        <p className="text-xs text-muted-foreground" role="status">
          Year / make / model / series filled from VIN.
        </p>
      ) : null}

      {listingMatch && listingDiffParts.length > 0 ? (
        <p className="text-xs text-muted-foreground" role="status">
          Auto-matched from listing
          {listingMatch.styleEstimated ? " (style approximated)" : ""}:{" "}
          {listingDiffParts.join(" · ")}
        </p>
      ) : null}

      {listingMatch?.styleEstimated && listingDiffParts.length === 0 ? (
        <p className="text-xs text-muted-foreground" role="status">
          Style approximated from listing — confirm series before trusting MMR.
        </p>
      ) : null}

      {decoding || listingApplying ? (
        <p className="text-xs text-muted-foreground" role="status">
          {listingApplying ? "Matching listing to Cox catalog…" : "Decoding VIN…"}
        </p>
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
                Year{fromVin ? " · From VIN" : ""}
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

        {selectField(
          "vehicle-make",
          fromVin ? "Make · From VIN" : "Make",
          values.make,
          (v) => updateField("make", v),
          makeOptions,
          {
            disabled: !values.year,
            loading: catalog.loading === "makes",
            placeholder: !values.year ? "Select year first" : "Select make",
          },
        )}

        {selectField(
          "vehicle-model",
          fromVin ? "Model · From VIN" : "Model",
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
          fromVin ? "Series · From VIN" : "Series",
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
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={!isDirty || pending || saveInFlight || listingApplying}
          >
            {saveInFlight || decoding ? "Decoding…" : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleUseListingIdentity()}
            disabled={!canApplyListing || pending || saveInFlight || listingApplying}
          >
            Use listing identity
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleReset}
            disabled={!isDirty || pending || saveInFlight || listingApplying}
          >
            Reset
          </Button>
          <Button type="button" size="sm" variant="ghost" asChild>
            <a href={mmrLabHref} target="_blank" rel="noopener noreferrer">
              Open in MMR Lab
            </a>
          </Button>
          {isDirty ? (
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" asChild>
            <a href={mmrLabHref} target="_blank" rel="noopener noreferrer">
              Open in MMR Lab
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}
