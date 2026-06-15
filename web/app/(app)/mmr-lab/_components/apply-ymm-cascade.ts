import type { MmrSelection } from "./search-panel";

/**
 * Apply dependent-dropdown rules when a Y/M/M/S field changes.
 * Clears only downstream fields; mileage is not part of the search panel.
 */
export function applyYmmCascadeChange(
  prev: MmrSelection,
  next: MmrSelection,
): MmrSelection {
  if (next.year !== prev.year) {
    // Preserve make/model/style — catalog useEffects will re-fetch for the new year
    // and invalidate downstream fields if they no longer exist in the new catalog.
    return { ...next };
  }
  if (next.make !== prev.make) {
    return {
      ...next,
      model: "",
      style: "",
    };
  }
  if (next.model !== prev.model) {
    return {
      ...next,
      style: "",
    };
  }
  return { ...next };
}
