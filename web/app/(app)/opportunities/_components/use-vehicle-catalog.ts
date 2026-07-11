"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  getMmrCatalogMakes,
  getMmrCatalogModels,
  getMmrCatalogStyles,
  getMmrCatalogYears,
} from "@/lib/app-api/client";
import { selectCatalogModelVariantForListing } from "@/lib/resolve-catalog-model";

import { resolveCatalogStyle } from "../../mmr-lab/_components/resolve-catalog-style";

/**
 * Vehicle catalog options for the manual submit form's Y/M/M/S dependent
 * dropdowns. Mirrors the fetch pattern used on `/mmr-lab`
 * (see `mmr-lab/_components/mmr-lab-client.tsx`) but packaged as a hook that
 * reads the current selection from the parent form, so the form remains the
 * single source of truth for year/make/model/style values.
 *
 * Catalog endpoints are the same `/mmr/catalog/years|makes|models|styles`
 * routes already in prod for MMR Lab.
 */
export type VehicleCatalogOptions = {
  years: string[];
  makes: string[];
  models: string[];
  styles: string[];
  catalogState: "connected" | "not_connected" | "unknown";
  reason: string | null;
  loading: "years" | "makes" | "models" | "styles" | null;
};

export type VehicleSelection = {
  year: string;
  make: string;
  model: string;
  style: string;
};

export const EMPTY_VEHICLE_SELECTION: VehicleSelection = {
  year: "",
  make: "",
  model: "",
  style: "",
};

const INITIAL_OPTIONS: VehicleCatalogOptions = {
  years: [],
  makes: [],
  models: [],
  styles: [],
  catalogState: "unknown",
  reason: null,
  loading: "years",
};

/**
 * Split years into recent (current year − 4 … current year) and older, recent
 * first. Mirrors `partitionYears` in `search-panel.tsx` so the submit form's
 * Year dropdown has the same "pin recent years at top" behavior shipped on
 * MMR Lab (NEXT_STEPS.md item #2).
 */
export function partitionYears(years: string[]): { recent: string[]; older: string[] } {
  const currentYear = new Date().getFullYear();
  const cutoff = currentYear - 4;
  const recent = years.filter((y) => Number(y) >= cutoff).sort((a, b) => Number(b) - Number(a));
  const older = years.filter((y) => Number(y) < cutoff).sort((a, b) => Number(b) - Number(a));
  return { recent, older };
}

/**
 * Case-insensitive, whitespace-normalized match of a free-text value (e.g.
 * from the listing parser) against catalog options. Returns the catalog's
 * canonical casing if a match is found, otherwise null.
 *
 * This is the parse-then-match fallback documented in
 * NEXT_STEPS_LEAD_TO_DEAL.md open question #6. Case-insensitive is the chosen
 * default — "toyota" / "Toyota" / "TOYOTA" all resolve to the catalog value.
 */
export function matchCatalogOption(
  options: string[],
  rawValue: string | undefined,
): string | null {
  if (!rawValue) return null;
  const needle = rawValue.trim().toLowerCase();
  if (!needle) return null;
  const exact = options.find((o) => o.toLowerCase() === needle);
  if (exact) return exact;
  const collapse = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const collapsedNeedle = collapse(rawValue);
  const collapsed = options.find((o) => collapse(o) === collapsedNeedle);
  return collapsed ?? null;
}

/**
 * Broader catalog pick: exact / case-insensitive / contains (either direction).
 * Used for verbose listing models like `sportage fe` → `Sportage` (item 46).
 */
export function pickCatalogOptionFuzzy(
  options: string[],
  rawValue: string | undefined,
): string | null {
  const exact = matchCatalogOption(options, rawValue);
  if (exact) return exact;
  if (!rawValue || options.length === 0) return null;
  const lower = rawValue.trim().toLowerCase();
  if (!lower) return null;
  const contains = options.find(
    (option) =>
      option.toLowerCase().includes(lower) || lower.includes(option.toLowerCase()),
  );
  return contains ?? null;
}

/**
 * Dependent-dropdown cascade for Y/M/M/S. When a parent changes, downstream
 * fields are cleared so stale selections can't survive a refetch. Mirrors
 * `applyYmmCascadeChange` in `mmr-lab/_components/apply-ymm-cascade.ts`.
 */
export function applyVehicleCascadeChange(
  prev: VehicleSelection,
  next: VehicleSelection,
): VehicleSelection {
  if (next.year !== prev.year) {
    return { ...next, make: "", model: "", style: "" };
  }
  if (next.make !== prev.make) {
    return { ...next, model: "", style: "" };
  }
  if (next.model !== prev.model) {
    return { ...next, style: "" };
  }
  return { ...next };
}

/**
 * Provides catalog option lists for Y/M/M/S dropdowns based on the current
 * selection (owned by the parent form). Fetches years on mount, makes when
 * year changes, models when year+make change, styles when year+make+model
 * change.
 *
 * @param selection - Current Y/M/M/S values from the parent form (read-only).
 *   The parent owns these values and updates them via its own `updateField`.
 */
export function useVehicleCatalogOptions(selection: VehicleSelection): VehicleCatalogOptions {
  const [options, setOptions] = useState<VehicleCatalogOptions>(INITIAL_OPTIONS);
  // Mirror selection into a ref inside a layout effect (not during render) so
  // async callbacks can read the latest values without resubscribing. Same
  // pattern as `mmr-lab-client.tsx`.
  const selectionRef = useRef(selection);
  useLayoutEffect(() => {
    selectionRef.current = selection;
  });

  // Years — fetch once on mount.
  useEffect(() => {
    let cancelled = false;
    void getMmrCatalogYears().then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setOptions((current) => ({
          ...current,
          years: res.data.items,
          catalogState: res.data.catalogState,
          reason: res.data.reason,
          loading: null,
        }));
      } else {
        setOptions((current) => ({
          ...current,
          years: [],
          catalogState: "not_connected",
          reason: res.error,
          loading: null,
        }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Makes — fetch when year changes.
  useEffect(() => {
    if (!selection.year) return;
    let cancelled = false;
    void getMmrCatalogMakes(selection.year).then((res) => {
      if (cancelled) return;
      const makes = res.ok ? res.data.items : [];
      setOptions((current) => ({
        ...current,
        makes,
        catalogState: res.ok ? res.data.catalogState : "not_connected",
        reason: res.ok ? res.data.reason : res.error,
        loading: null,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [selection.year]);

  // Models — fetch when year+make change.
  useEffect(() => {
    if (!selection.year || !selection.make) return;
    let cancelled = false;
    void getMmrCatalogModels(selection.year, selection.make).then((res) => {
      if (cancelled) return;
      const models = res.ok ? res.data.items : [];
      setOptions((current) => ({
        ...current,
        models,
        catalogState: res.ok ? res.data.catalogState : "not_connected",
        reason: res.ok ? res.data.reason : res.error,
        loading: null,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [selection.year, selection.make]);

  // Styles — fetch when year+make+model change.
  useEffect(() => {
    if (!selection.year || !selection.make || !selection.model) return;
    let cancelled = false;
    void getMmrCatalogStyles(selection.year, selection.make, selection.model).then((res) => {
      if (cancelled) return;
      setOptions((current) => ({
        ...current,
        styles: res.ok ? res.data.items : [],
        catalogState: res.ok ? res.data.catalogState : "not_connected",
        reason: res.ok ? res.data.reason : res.error,
        loading: null,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [selection.year, selection.make, selection.model]);

  return options;
}

/**
 * Resolve a free-text Y/M/M/S payload (from the listing parser) against the
 * catalog by fetching options at each level and matching
 * case-insensitively. Returns only the fields that matched a catalog option;
 * unmatched fields are left empty so the user can pick from the dropdown.
 *
 * This is the parse-then-match path documented in
 * NEXT_STEPS_LEAD_TO_DEAL.md section B, row #9.
 */
export async function resolveParsedVehicleFields(
  parsed: Partial<VehicleSelection>,
): Promise<VehicleSelection> {
  const result = await resolveListingToCatalog({
    year: parsed.year,
    make: parsed.make,
    model: parsed.model,
    style: parsed.style,
  });
  return result.selection;
}

export type ListingCatalogField = keyof VehicleSelection;

export type ListingCatalogChange = { from: string; to: string };

export type ListingCatalogResolution = {
  selection: VehicleSelection;
  /** True when style was approximated (not an exact catalog match). */
  styleEstimated: boolean;
  /** Fields where Cox token differs from the listing/parser value. */
  changedFields: Partial<Record<ListingCatalogField, ListingCatalogChange>>;
  /** Levels that could not be resolved to a catalog token. */
  unmatched: ListingCatalogField[];
};

export type ListingCatalogInput = {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  style?: string | null;
  title?: string | null;
};

function recordChange(
  changed: ListingCatalogResolution["changedFields"],
  field: ListingCatalogField,
  from: string | null | undefined,
  to: string,
): void {
  const raw = (from ?? "").trim();
  if (!raw || raw === to) return;
  changed[field] = { from: raw, to };
}

/**
 * Item 46 — map listing-parsed identity onto Cox catalog tokens.
 *
 * Cascade: year → make → model (exact → fuzzy → variant → strip trailing
 * tokens) → style (`resolveCatalogStyle` with listing style / leftover model
 * tokens / title). Never invents mileage.
 */
export async function resolveListingToCatalog(
  input: ListingCatalogInput,
): Promise<ListingCatalogResolution> {
  const selection: VehicleSelection = { ...EMPTY_VEHICLE_SELECTION };
  const changedFields: ListingCatalogResolution["changedFields"] = {};
  const unmatched: ListingCatalogField[] = [];
  let styleEstimated = false;

  const yearRaw = input.year != null ? String(input.year) : "";
  const makeRaw = input.make?.trim() ?? "";
  const modelRaw = input.model?.trim() ?? "";
  const styleRaw = input.style?.trim() ?? "";
  const title = input.title?.trim() ?? "";

  if (!yearRaw) {
    return { selection, styleEstimated, changedFields, unmatched: ["year", "make", "model", "style"] };
  }

  const yearsRes = await getMmrCatalogYears();
  const years = yearsRes.ok ? yearsRes.data.items : [];
  const matchedYear = matchCatalogOption(years, yearRaw);
  if (!matchedYear) {
    return { selection, styleEstimated, changedFields, unmatched: ["year", "make", "model", "style"] };
  }
  selection.year = matchedYear;
  recordChange(changedFields, "year", yearRaw, matchedYear);

  if (!makeRaw) {
    return { selection, styleEstimated, changedFields, unmatched: ["make", "model", "style"] };
  }

  const makesRes = await getMmrCatalogMakes(matchedYear);
  const makes = makesRes.ok ? makesRes.data.items : [];
  const matchedMake = pickCatalogOptionFuzzy(makes, makeRaw);
  if (!matchedMake) {
    return { selection, styleEstimated, changedFields, unmatched: ["make", "model", "style"] };
  }
  selection.make = matchedMake;
  recordChange(changedFields, "make", makeRaw, matchedMake);

  if (!modelRaw) {
    return { selection, styleEstimated, changedFields, unmatched: ["model", "style"] };
  }

  const modelsRes = await getMmrCatalogModels(matchedYear, matchedMake);
  const models = modelsRes.ok ? modelsRes.data.items : [];

  let matchedModel = pickCatalogOptionFuzzy(models, modelRaw);
  let leftoverStyleEvidence = "";

  if (!matchedModel) {
    const variant = selectCatalogModelVariantForListing({
      models,
      sourceModel: modelRaw,
      title,
      trim: styleRaw || null,
    });
    if (variant) matchedModel = variant.model;
  }

  if (!matchedModel) {
    // Verbose model: `sportage fe` → try `sportage`, keep `fe` as style evidence
    const parts = modelRaw.split(/\s+/).filter(Boolean);
    while (!matchedModel && parts.length > 1) {
      const stripped = parts.pop()!;
      leftoverStyleEvidence = [stripped, leftoverStyleEvidence].filter(Boolean).join(" ");
      const candidate = parts.join(" ");
      matchedModel = pickCatalogOptionFuzzy(models, candidate);
      if (!matchedModel) {
        const variant = selectCatalogModelVariantForListing({
          models,
          sourceModel: candidate,
          title,
          trim: styleRaw || leftoverStyleEvidence || null,
        });
        if (variant) matchedModel = variant.model;
      }
    }
  }

  if (!matchedModel) {
    unmatched.push("model", "style");
    return { selection, styleEstimated, changedFields, unmatched };
  }
  selection.model = matchedModel;
  recordChange(changedFields, "model", modelRaw, matchedModel);

  // Leftover tokens from verbose models (e.g. `sportage fe` → FE) feed style match.
  if (!leftoverStyleEvidence) {
    const rawParts = modelRaw.toLowerCase().split(/\s+/).filter(Boolean);
    const modelParts = matchedModel.toLowerCase().split(/\s+/).filter(Boolean);
    leftoverStyleEvidence = rawParts
      .filter((part) => !modelParts.includes(part))
      .join(" ");
  }

  const stylesRes = await getMmrCatalogStyles(matchedYear, matchedMake, matchedModel);
  const styles = stylesRes.ok ? stylesRes.data.items : [];
  if (styles.length === 0) {
    unmatched.push("style");
    return { selection, styleEstimated, changedFields, unmatched };
  }

  const styleEvidence =
    styleRaw || leftoverStyleEvidence || (title ? title : "");
  const exactStyle = matchCatalogOption(styles, styleRaw || leftoverStyleEvidence);
  if (exactStyle) {
    selection.style = exactStyle;
    recordChange(changedFields, "style", styleRaw || leftoverStyleEvidence, exactStyle);
    return { selection, styleEstimated: false, changedFields, unmatched };
  }

  const styleResolved = resolveCatalogStyle(styles, styleEvidence || null);
  if (!styleResolved) {
    unmatched.push("style");
    return { selection, styleEstimated, changedFields, unmatched };
  }
  selection.style = styleResolved.style;
  styleEstimated = styleResolved.isEstimated;
  const styleFrom = styleRaw || leftoverStyleEvidence;
  if (styleFrom) {
    recordChange(changedFields, "style", styleFrom, styleResolved.style);
  }
  return { selection, styleEstimated, changedFields, unmatched };
}

/** Build `/mmr-lab?…` href with catalog-canonical tokens (item 46 Phase D). */
export function buildMmrLabPrefillHref(input: {
  vin?: string | null;
  selection?: Partial<VehicleSelection> | null;
}): string {
  const vin = input.vin?.trim();
  if (vin) return `/mmr-lab?vin=${encodeURIComponent(vin)}`;

  const year = input.selection?.year?.trim() ?? "";
  const make = input.selection?.make?.trim() ?? "";
  const model = input.selection?.model?.trim() ?? "";
  const style = input.selection?.style?.trim() ?? "";
  if (year && make && model && style) {
    const params = new URLSearchParams({ year, make, model, style });
    return `/mmr-lab?${params.toString()}`;
  }
  return "/mmr-lab";
}
