"use client";

import { useEffect, useRef, useState } from "react";

import {
  getMmrCatalogMakes,
  getMmrCatalogModels,
  getMmrCatalogStyles,
  getMmrCatalogYears,
} from "@/lib/app-api/client";

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
  // Track whether a downstream field's current value is still valid after a
  // parent refetch; if not, the parent form must clear it. We can't clear it
  // here because we don't own the selection — instead we expose the invalid
  // state via a callback the parent can register.
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  // Years — fetch once on mount.
  useEffect(() => {
    let cancelled = false;
    setOptions((c) => ({ ...c, loading: "years" }));
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
    if (!selection.year) {
      setOptions((c) => ({ ...c, makes: [], loading: null }));
      return;
    }
    let cancelled = false;
    setOptions((c) => ({ ...c, loading: "makes" }));
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
    if (!selection.year || !selection.make) {
      setOptions((c) => ({ ...c, models: [], loading: null }));
      return;
    }
    let cancelled = false;
    setOptions((c) => ({ ...c, loading: "models" }));
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
    if (!selection.year || !selection.make || !selection.model) {
      setOptions((c) => ({ ...c, styles: [], loading: null }));
      return;
    }
    let cancelled = false;
    setOptions((c) => ({ ...c, loading: "styles" }));
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
  const resolved: VehicleSelection = { ...EMPTY_VEHICLE_SELECTION };
  if (!parsed.year) return resolved;

  const yearsRes = await getMmrCatalogYears();
  const years = yearsRes.ok ? yearsRes.data.items : [];
  const matchedYear = matchCatalogOption(years, parsed.year);
  if (!matchedYear) return resolved;
  resolved.year = matchedYear;

  const makesRes = await getMmrCatalogMakes(matchedYear);
  const makes = makesRes.ok ? makesRes.data.items : [];
  const matchedMake = matchCatalogOption(makes, parsed.make);
  if (!matchedMake) return resolved;
  resolved.make = matchedMake;

  const modelsRes = await getMmrCatalogModels(matchedYear, matchedMake);
  const models = modelsRes.ok ? modelsRes.data.items : [];
  const matchedModel = matchCatalogOption(models, parsed.model);
  if (!matchedModel) return resolved;
  resolved.model = matchedModel;

  const stylesRes = await getMmrCatalogStyles(matchedYear, matchedMake, matchedModel);
  const styles = stylesRes.ok ? stylesRes.data.items : [];
  const matchedStyle = matchCatalogOption(styles, parsed.style);
  if (matchedStyle) resolved.style = matchedStyle;

  return resolved;
}
