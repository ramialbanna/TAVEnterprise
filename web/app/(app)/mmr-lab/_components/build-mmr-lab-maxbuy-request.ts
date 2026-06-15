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

/** Attach Cox year/make/model from a completed VIN MMR lookup for MaxBuy fallback. */
export function mmrVinSessionFromResult(vin: string, result: MmrVinOk): MmrLabLookupSession {
  return {
    kind: "vin",
    vin,
    ...(result.year != null ? { year: result.year } : {}),
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
