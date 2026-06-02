/**
 * Hard-gate runner (v1 stub framework).
 *
 * Catalog gates from TECHNICAL-SPEC §5.1 are stubbed until announcement/title
 * data is wired. MMR missing is enforced in scoreMaxBuy after MMR lookup.
 */
export type GateInput = {
  vin: string;
};

export function runHardGates(_input: GateInput): string | null {
  return null;
}
