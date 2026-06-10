import { codeMessage } from "@/lib/app-api/missing-reason";
import type { ApiResult } from "@/lib/app-api";
import type { MaxbuyEvaluateOk } from "@/lib/app-api/schemas";

import type { MaxbuyEvaluationState } from "./maxbuy-evaluation-section";
import { mapMaxbuyEvaluateToDisplay } from "./map-maxbuy-display";

export function applyMaxbuyResult(
  res: ApiResult<MaxbuyEvaluateOk>,
  askingPrice: number | null,
): MaxbuyEvaluationState {
  if (res.ok) {
    return { kind: "ready", display: mapMaxbuyEvaluateToDisplay(res.data, askingPrice) };
  }
  if (res.kind === "unavailable") {
    return { kind: "unavailable", reason: "api_off" };
  }
  return { kind: "error", message: codeMessage(res.error) };
}
