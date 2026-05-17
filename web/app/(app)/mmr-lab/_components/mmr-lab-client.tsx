"use client";

import { useCallback, useState } from "react";
import { postMmrVin } from "@/lib/app-api/client";
import { ErrorState } from "@/components/data-state";
import { SearchPanel } from "./search-panel";
import { ResultBand } from "./result-band";
import { DataSections } from "./data-sections";

/**
 * MMR Lab client surface.
 *
 * VIN is the ONLY valuation path: browser → postMmrVin → /api/app/mmr/vin →
 * Worker. The lean envelope returns valuation only, so only Base MMR is ever
 * populated; every other zone stays honest `--`. Year/Make/Model/Style is
 * rendered DISABLED ("live catalog not connected") — there is no hardcoded
 * catalog and no scraping; official metadata + YMM valuation are tracked in
 * issue #45. No dummy prefill, no client-only YMM/asking/spread state.
 */
type View =
  | { kind: "empty" }
  | { kind: "loading" }
  | {
      kind: "ok";
      baseMmr: number;
      confidence: "high" | "medium" | "low" | null;
      method: string | null;
    }
  | { kind: "unavailable"; reason: string }
  | { kind: "error"; error: Parameters<typeof ErrorState>[0]["error"] };

export function MmrLabClient() {
  const [view, setView] = useState<View>({ kind: "empty" });
  const [lastVin, setLastVin] = useState<string | null>(null);

  const onVinSubmit = useCallback(async (vin: string) => {
    setLastVin(vin);
    setView({ kind: "loading" });
    const res = await postMmrVin({ vin });
    if (res.ok) {
      setView({
        kind: "ok",
        baseMmr: res.data.mmrValue,
        confidence: res.data.confidence ?? null,
        method: res.data.method ?? null,
      });
    } else if (res.kind === "unavailable") {
      setView({ kind: "unavailable", reason: res.error });
    } else {
      setView({ kind: "error", error: res });
    }
  }, []);

  return (
    <div className="space-y-6">
      <SearchPanel onVinSubmit={(v) => void onVinSubmit(v)} vinPending={view.kind === "loading"} />

      {lastVin && view.kind !== "empty" ? (
        <div className="px-6 text-sm text-muted-foreground">
          VIN: <span className="font-mono">{lastVin}</span>
        </div>
      ) : null}

      {view.kind === "error" ? (
        <div className="px-6">
          <ErrorState
            error={view.error}
            onRetry={lastVin ? () => void onVinSubmit(lastVin) : undefined}
          />
        </div>
      ) : (
        <ResultBand
          baseMmr={view.kind === "ok" ? view.baseMmr : null}
          confidence={view.kind === "ok" ? view.confidence : null}
          method={view.kind === "ok" ? view.method : null}
          unavailableReason={view.kind === "unavailable" ? view.reason : null}
        />
      )}

      <DataSections />
    </div>
  );
}
