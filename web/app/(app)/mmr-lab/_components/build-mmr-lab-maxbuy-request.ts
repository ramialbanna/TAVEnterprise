import { buildMaxbuyEvaluateRequest } from "@/components/maxbuy/maxbuy-evaluate-form";
import type { MaxbuyEvaluateRequest } from "@/lib/app-api/client";

import type { MmrSelection } from "./search-panel";

export type MmrLabLookupSession =
  | { kind: "vin"; vin: string; mileage?: string }
  | { kind: "ymm"; selection: MmrSelection };

/** Build `POST /app/maxbuy/evaluate` body from MMR Lab search session (P2.2). */
export function buildMmrLabMaxbuyRequest(
  session: MmrLabLookupSession,
  laneAskPrice: string,
): { body: MaxbuyEvaluateRequest; askingPrice: number | null } | { error: string } {
  if (session.kind === "vin") {
    return buildMaxbuyEvaluateRequest({
      vin: session.vin,
      year: "",
      make: "",
      model: "",
      trim: "",
      mileage: session.mileage ?? "",
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
    mileage: selection.mileage,
    askingPrice: laneAskPrice,
    region: "",
  });
}
