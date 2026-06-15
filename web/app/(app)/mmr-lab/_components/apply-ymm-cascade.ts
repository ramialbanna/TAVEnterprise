import type { MmrSelection } from "./search-panel";

/**
 * Apply dependent-dropdown rules when a Y/M/M/S field changes.
 * Clears only downstream fields; always preserves mileage unless the user edits it.
 */
export function applyYmmCascadeChange(
  prev: MmrSelection,
  next: MmrSelection,
): MmrSelection {
  const mileage = next.mileage !== "" ? next.mileage : prev.mileage;

  if (next.year !== prev.year) {
    // Preserve make/model/style — catalog useEffects will re-fetch for the new year
    // and invalidate downstream fields if they no longer exist in the new catalog.
    return {
      ...next,
      mileage,
    };
  }
  if (next.make !== prev.make) {
    return {
      ...next,
      model: "",
      style: "",
      mileage,
    };
  }
  if (next.model !== prev.model) {
    return {
      ...next,
      style: "",
      mileage,
    };
  }
  return { ...next, mileage };
}
