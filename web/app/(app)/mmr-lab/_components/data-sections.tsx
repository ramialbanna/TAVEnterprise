import type { MmrLowerSectionState } from "./mmr-lower-section-state";
import { HistoricalProjected } from "./historical-projected";
import { TransactionsTable } from "./transactions-table";

type Props = {
  state?: MmrLowerSectionState;
};

/** Zones C2 + C3 — wholesale comps and market averages (Phase 4 live data). */
export function DataSections({ state = "idle" }: Props) {
  return (
    <div className="space-y-6 pb-6">
      <TransactionsTable state={state} />
      <HistoricalProjected state={state} />
    </div>
  );
}
