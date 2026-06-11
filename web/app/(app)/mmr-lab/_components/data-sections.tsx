import type { MmrLowerSectionsState } from "./mmr-lower-section-state";
import { HistoricalProjected } from "./historical-projected";
import { TransactionsTable } from "./transactions-table";

type Props = {
  state?: MmrLowerSectionsState;
};

/** Zones C2 + C3 — wholesale comps and market averages (Phase 4 live data). */
export function DataSections({ state = { phase: "idle" } }: Props) {
  const phase = state.phase;
  const market = state.phase === "ready" ? state.market : undefined;

  return (
    <div className="space-y-6 pb-6">
      <TransactionsTable phase={phase} transactions={market?.transactions} />
      <HistoricalProjected
        phase={phase}
        historicalAverages={market?.historicalAverages}
        projectedAverage={market?.projectedAverage}
      />
    </div>
  );
}
