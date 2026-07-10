import {
  getMmrCatalogYears,
  postMmrVin,
} from "@/lib/app-api/client";
import { codeMessage } from "@/lib/app-api";
import type { MmrVinOk } from "@/lib/app-api/schemas";

import {
  hydrateVinAutofill,
  type StyleMatchKind,
} from "../../mmr-lab/_components/hydrate-vin-autofill";
import type { VehicleSelection } from "./use-vehicle-catalog";

/** Normalize user VIN input for Cox lookup (strip separators, uppercase). */
export function normalizeOpportunityVin(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-HJ-NPR-Z0-9]/gi, "");
}

/** Worker accepts 11–17 characters for POST /app/mmr/vin. */
export function isDecodableVin(vin: string): boolean {
  return vin.length >= 11 && vin.length <= 17;
}

export type VinDecodeSuccess = {
  ok: true;
  selection: VehicleSelection;
  styleMatch: StyleMatchKind;
  coxTrim: string | null;
  mmr: MmrVinOk;
};

export type VinDecodeFailure = {
  ok: false;
  /** Human-readable error; caller must keep VIN and existing YMM. */
  error: string;
};

export type VinDecodeResult = VinDecodeSuccess | VinDecodeFailure;

/**
 * VIN → Cox MMR lookup → catalog-backed Y/M/M/S (NEXT_STEPS #48).
 * Does not persist; caller PATCHes and remounts valuation.
 */
export async function decodeVinToVehicleSelection(
  rawVin: string,
  opts?: { mileage?: number | null; catalogYears?: string[] },
): Promise<VinDecodeResult> {
  const vin = normalizeOpportunityVin(rawVin);
  if (!isDecodableVin(vin)) {
    return { ok: false, error: "Enter a valid VIN (11–17 characters) to decode." };
  }

  const body: { vin: string; mileage?: number } = { vin };
  if (opts?.mileage != null && Number.isFinite(opts.mileage) && opts.mileage > 0) {
    body.mileage = Math.round(opts.mileage);
  }

  let mmrRes;
  try {
    mmrRes = await postMmrVin(body);
  } catch {
    return { ok: false, error: "VIN decode failed — check your connection and try again." };
  }

  if (!mmrRes.ok) {
    return {
      ok: false,
      error:
        mmrRes.message ||
        codeMessage(mmrRes.error) ||
        "Could not decode this VIN. Year/make/model were left unchanged.",
    };
  }

  let years = opts?.catalogYears ?? [];
  if (years.length === 0) {
    const yearsRes = await getMmrCatalogYears();
    if (!yearsRes.ok) {
      return {
        ok: false,
        error: "Vehicle catalog unavailable — VIN was kept; pick year/make/model manually.",
      };
    }
    years = yearsRes.data.items;
  }

  const autofill = await hydrateVinAutofill(mmrRes.data, years);
  if (!autofill) {
    return {
      ok: false,
      error:
        "VIN looked up but could not match Cox catalog year/make/model. Pick them from the dropdowns.",
    };
  }

  return {
    ok: true,
    selection: autofill.selection,
    styleMatch: autofill.styleMatch,
    coxTrim: autofill.coxTrim,
    mmr: mmrRes.data,
  };
}
