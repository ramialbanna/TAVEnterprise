import type { MmrSelection } from "./search-panel";

export type MmrLabPrefill =
  | { kind: "vin"; vin: string }
  | { kind: "ymm"; selection: MmrSelection };

/** Read `/mmr-lab?vin=…` or `?year=&make=&model=&style=` from opportunity detail links. */
export function readMmrLabPrefill(params: URLSearchParams): MmrLabPrefill | null {
  const vin = params.get("vin")?.trim();
  if (vin) return { kind: "vin", vin };

  const year = params.get("year")?.trim() ?? "";
  const make = params.get("make")?.trim() ?? "";
  const model = params.get("model")?.trim() ?? "";
  const style = params.get("style")?.trim() ?? "";
  if (year && make && model && style) {
    return { kind: "ymm", selection: { year, make, model, style } };
  }

  return null;
}
