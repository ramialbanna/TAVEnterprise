import { buildMaxbuyEvaluateRequest } from "@/components/maxbuy/maxbuy-evaluate-form";
import type { MaxbuyEvaluateRequest } from "@/lib/app-api/client";
import type { MmrVinOk } from "@/lib/app-api/schemas";

import type { MmrSelection } from "./search-panel";
import { parseAdjustmentOdometer, type MmrAdjustments } from "./mmr-adjustments";

export type MmrLabLookupSession =
  | {
      kind: "vin";
      vin: string;
      year?: number;
      make?: string;
      model?: string;
      trim?: string;
    }
  | { kind: "ymm"; selection: MmrSelection };

// VIN model-year codes (digit 10). Mirrors src/maxbuy/vin.ts on the worker so
// the frontend can seed the MaxBuy session with at least the year when Cox's
// payload omits vehicle identity. A VIN alone is enough for the worker's
// year-decode fallback, but sending the year explicitly lets
// `vehicleContextFromRequestFields` succeed without relying on that fallback
// being deployed.
const VIN_MODEL_YEAR_CODES: Record<string, number> = {
  A: 2010, B: 2011, C: 2012, D: 2013, E: 2014, F: 2015, G: 2016, H: 2017,
  J: 2018, K: 2019, L: 2020, M: 2021, N: 2022, P: 2023, R: 2024,
  S: 2025, T: 2026, V: 2027, W: 2028, X: 2029, Y: 2030,
  "1": 2001, "2": 2002, "3": 2003, "4": 2004, "5": 2005, "6": 2006, "7": 2007, "8": 2008, "9": 2009,
};

function decodeVinModelYear(vin: string): number | null {
  if (vin.length !== 17) return null;
  const code = vin[9]!;
  return VIN_MODEL_YEAR_CODES[code] ?? null;
}

/** Attach Cox year/make/model from a completed VIN MMR lookup for MaxBuy fallback. */
export function mmrVinSessionFromResult(vin: string, result: MmrVinOk): MmrLabLookupSession {
  // Prefer Cox's explicit year; fall back to VIN digit-10 decode so the MaxBuy
  // body always carries a year even when Cox's payload omits vehicle identity.
  const year = result.year ?? decodeVinModelYear(vin);
  return {
    kind: "vin",
    vin,
    ...(year != null ? { year } : {}),
    ...(result.make ? { make: result.make } : {}),
    ...(result.model ? { model: result.model } : {}),
    ...(result.trim ? { trim: result.trim } : {}),
  };
}

function effectiveMileageString(adjustments?: MmrAdjustments): string {
  const fromAdj = adjustments ? parseAdjustmentOdometer(adjustments.odometer) : null;
  return fromAdj !== null ? String(fromAdj) : "";
}

/** Build `POST /app/maxbuy/evaluate` body from MMR Lab search session (P2.2). */
export function buildMmrLabMaxbuyRequest(
  session: MmrLabLookupSession,
  laneAskPrice: string,
  adjustments?: MmrAdjustments,
): { body: MaxbuyEvaluateRequest; askingPrice: number | null } | { error: string } {
  const mileage = effectiveMileageString(adjustments);

  if (session.kind === "vin") {
    const built = buildMaxbuyEvaluateRequest({
      vin: session.vin,
      year: "",
      make: "",
      model: "",
      trim: "",
      mileage,
      askingPrice: laneAskPrice,
      region: "",
    });
    if ("error" in built) return built;

    const body = built.body;
    // Always forward YMM from the session so the worker can resolve vehicle
    // context without relying on a DB hit or the VIN year-decode fallback.
    if (session.year !== undefined) body.year = session.year;
    if (session.make) body.make = session.make;
    if (session.model) body.model = session.model;
    if (session.trim) body.trim = session.trim;
    return { body, askingPrice: built.askingPrice };
  }

  const { selection } = session;
  return buildMaxbuyEvaluateRequest({
    vin: "",
    year: selection.year,
    make: selection.make,
    model: selection.model,
    trim: selection.style,
    mileage,
    askingPrice: laneAskPrice,
    region: "",
  });
}
