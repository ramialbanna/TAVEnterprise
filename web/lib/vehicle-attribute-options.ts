/**
 * Static vehicle attribute picklists for opportunity detail (item #31).
 * Y/M/M/S come from Cox `/mmr/catalog/*`; color aligns with MMR Lab
 * (`MMR_COLOR_OPTIONS`). Body type, engine, and transmission have no Cox
 * catalog endpoint — these curated lists match common vAuto-style values,
 * with `selectOptionsWithLegacy` preserving scraper free-text until re-selected.
 */

export const VEHICLE_BODY_TYPE_OPTIONS = [
  "Sedan",
  "Coupe",
  "Convertible",
  "Hatchback",
  "Wagon",
  "SUV",
  "Crossover",
  "Truck",
  "Pickup",
  "Van",
  "Minivan",
  "Cargo Van",
  "Chassis Cab",
  "Other",
] as const;

export const VEHICLE_TRANSMISSION_OPTIONS = [
  "Automatic",
  "Manual",
  "CVT",
  "Dual-Clutch",
  "Automated Manual",
  "Other",
] as const;

/** Size / fuel-type buckets when VIN-decode-specific engines are unavailable. */
export const VEHICLE_ENGINE_OPTIONS = [
  "4-Cylinder",
  "6-Cylinder",
  "8-Cylinder",
  "10-Cylinder",
  "12-Cylinder",
  "Electric",
  "Hybrid",
  "Plug-in Hybrid",
  "Diesel",
  "Rotary",
  "Other",
] as const;

/** Include a saved free-text value when it is not in the catalog/static list. */
export function selectOptionsWithLegacy(
  options: readonly string[],
  currentValue: string,
): string[] {
  const trimmed = currentValue.trim();
  if (!trimmed) return [...options];
  const exists = options.some((o) => o.toLowerCase() === trimmed.toLowerCase());
  if (exists) return [...options];
  return [trimmed, ...options];
}
