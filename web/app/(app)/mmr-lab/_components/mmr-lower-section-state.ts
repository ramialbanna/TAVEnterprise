/** Zone C2/C3 display state — live Cox data ships in Phase 4. */
export type MmrLowerSectionState = "idle" | "loading" | "empty";

type ViewKind = "empty" | "loading" | "ok" | "unavailable" | "error";

export function lowerSectionStateFromView(viewKind: ViewKind): MmrLowerSectionState {
  if (viewKind === "loading") return "loading";
  if (viewKind === "ok" || viewKind === "unavailable") return "empty";
  return "idle";
}
