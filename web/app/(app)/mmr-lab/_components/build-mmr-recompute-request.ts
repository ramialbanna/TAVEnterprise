import type { MmrVinRequest, MmrYmmRequest } from "@/lib/app-api/client";

import type { MmrLabLookupSession } from "./build-mmr-lab-maxbuy-request";
import {
  mapMmrAdjustmentsToApi,
  parseAdjustmentOdometer,
  type MmrAdjustments,
} from "./mmr-adjustments";

/** Build `POST /app/mmr/vin|ymm` body for adjustment recompute (P3). */
export function buildMmrRecomputeRequest(
  session: MmrLabLookupSession,
  adjustments: MmrAdjustments,
): MmrVinRequest | MmrYmmRequest {
  const apiAdjustments = mapMmrAdjustmentsToApi(adjustments);
  const odo = parseAdjustmentOdometer(adjustments.odometer);

  const resolvedAdjustments =
    apiAdjustments ??
    (session.kind === "vin" && !adjustments.buildOptions && odo === null
      ? { exclude_build: true as const }
      : undefined);

  if (session.kind === "vin") {
    const body: MmrVinRequest = { vin: session.vin };
    if (odo !== null) body.mileage = odo;
    if (resolvedAdjustments) body.adjustments = resolvedAdjustments;
    return body;
  }

  const body: MmrYmmRequest = {
    year: Number(session.selection.year),
    make: session.selection.make,
    model: session.selection.model,
    style: session.selection.style,
  };
  if (odo !== null) body.mileage = odo;
  if (resolvedAdjustments) body.adjustments = resolvedAdjustments;
  return body;
}
