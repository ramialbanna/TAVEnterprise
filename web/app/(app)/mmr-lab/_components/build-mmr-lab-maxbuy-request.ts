import { buildMaxbuyEvaluateRequest } from "@/components/maxbuy/maxbuy-evaluate-form";
import type { MaxbuyEvaluateRequest } from "@/lib/app-api/client";

import type { MmrSelection } from "./search-panel";
import { parseAdjustmentOdometer, type MmrAdjustments } from "./mmr-adjustments";

export type MmrLabLookupSession =
  | { kind: "vin"; vin: string }
  | { kind: "ymm"; selection: MmrSelection };

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
    return buildMaxbuyEvaluateRequest({
      vin: session.vin,
      year: "",
      make: "",
      model: "",
      trim: "",
      mileage,
      askingPrice: laneAskPrice,
      region: "",
    });
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
