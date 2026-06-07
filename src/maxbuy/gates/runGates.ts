/**
 * Hard-gate runner — TECHNICAL-SPEC §5.1 / DEC-4.
 *
 * Gates enforce a forced PASS regardless of model economics. They run *before*
 * scoring (see evaluateRun.ts). All flags are optional: a gate only fires when
 * the caller explicitly passes `true` — if the data is not yet wired, the gate
 * is silent (MB-ENG-4: "enforce PASS only when gate data exists").
 *
 * GATE_MMR_MISSING is enforced inside scoreMaxBuy (after the MMR lookup) and is
 * intentionally excluded here to avoid a redundant early return before economics
 * are computed for the response payload.
 */

export const GATE_CODES = {
  TITLE_BRAND: "GATE_TITLE_BRAND",
  SALVAGE: "GATE_SALVAGE",
  FLOOD: "GATE_FLOOD",
  FRAME_STRUCTURAL: "GATE_FRAME_STRUCTURAL",
  ODOMETER: "GATE_ODOMETER",
  RECALL_STOPSALE: "GATE_RECALL_STOPSALE",
  ARBITRATION: "GATE_ARBITRATION",
  SOURCE_RESTRICTED: "GATE_SOURCE_RESTRICTED",
} as const;

export type GateCode = (typeof GATE_CODES)[keyof typeof GATE_CODES];

export type GateInput = {
  /**
   * VIN is optional for YMM-only evaluations (OPEN-5). Title/condition gates
   * that depend on VIN history are not checked when VIN is absent.
   */
  vin?: string;
  /**
   * Title/condition/source flags sourced from title history providers (e.g. CarFax,
   * AutoCheck) or TAV acquisition policy. Wire these when that data is available;
   * leave undefined (or omit) when not — the gate will not fire.
   */
  titleBranded?: boolean;
  salvage?: boolean;
  flood?: boolean;
  frameStructural?: boolean;
  odometerDiscrepancy?: boolean;
  recallStopSale?: boolean;
  arbitrationFlag?: boolean;
  sourceRestricted?: boolean;
};

/**
 * Returns the first triggered gate code in priority order, or null if none fire.
 * Priority follows DEC-4: legal/title exclusions first, operational restrictions last.
 */
export function runHardGates(input: GateInput): GateCode | null {
  if (input.titleBranded) return GATE_CODES.TITLE_BRAND;
  if (input.salvage) return GATE_CODES.SALVAGE;
  if (input.flood) return GATE_CODES.FLOOD;
  if (input.frameStructural) return GATE_CODES.FRAME_STRUCTURAL;
  if (input.odometerDiscrepancy) return GATE_CODES.ODOMETER;
  if (input.recallStopSale) return GATE_CODES.RECALL_STOPSALE;
  if (input.arbitrationFlag) return GATE_CODES.ARBITRATION;
  if (input.sourceRestricted) return GATE_CODES.SOURCE_RESTRICTED;
  return null;
}
