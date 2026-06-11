import type { MmrVinRequest, MmrYmmRequest } from "@/lib/app-api/client";

import type { MmrLabLookupSession } from "./build-mmr-lab-maxbuy-request";
import {
  mapMmrAdjustmentsToApi,
  parseAdjustmentOdometer,
  type MmrAdjustments,
} from "./mmr-adjustments";

function ymmMileage(
  session: Extract<MmrLabLookupSession, { kind: "ymm" }>,
  adjustments: MmrAdjustments,
): number {
  const fromAdj = parseAdjustmentOdometer(adjustments.odometer);
  if (fromAdj !== null) return fromAdj;
  const fromSelection = parseAdjustmentOdometer(session.selection.mileage);
  if (fromSelection !== null) return fromSelection;
  return 0;
}

/** Build `POST /app/mmr/vin|ymm` body for adjustment recompute (P3). */
export function buildMmrRecomputeRequest(
  session: MmrLabLookupSession,
  adjustments: MmrAdjustments,
): MmrVinRequest | MmrYmmRequest {
  const apiAdjustments = mapMmrAdjustmentsToApi(adjustments);

  if (session.kind === "vin") {
    const body: MmrVinRequest = { vin: session.vin };
    const odo = parseAdjustmentOdometer(adjustments.odometer);
    if (odo !== null) body.mileage = odo;
    if (apiAdjustments) body.adjustments = apiAdjustments;
    return body;
  }

  const body: MmrYmmRequest = {
    year: Number(session.selection.year),
    make: session.selection.make,
    model: session.selection.model,
    style: session.selection.style,
    mileage: ymmMileage(session, adjustments),
  };
  if (apiAdjustments) body.adjustments = apiAdjustments;
  return body;
}
