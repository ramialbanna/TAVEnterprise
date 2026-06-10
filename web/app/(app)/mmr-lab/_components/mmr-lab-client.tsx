"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getMmrCatalogMakes,
  getMmrCatalogModels,
  getMmrCatalogStyles,
  getMmrCatalogYears,
  postMaxbuyEvaluate,
  postMmrVin,
  postMmrYmm,
} from "@/lib/app-api/client";
import { ErrorState, type ApiErrorResult } from "@/components/data-state";
import type { MmrVinOk } from "@/lib/app-api/schemas";
import {
  SearchPanel,
  type MmrCatalogOptions,
  type MmrSelection,
} from "./search-panel";
import { ResultBand } from "./result-band";
import { DataSections } from "./data-sections";
import { lowerSectionStateFromView } from "./mmr-lower-section-state";
import {
  MaxbuyEvaluationSection,
  type MaxbuyEvaluationState,
} from "./maxbuy-evaluation-section";
import { applyMaxbuyResult } from "./apply-maxbuy-result";
import {
  buildMmrLabMaxbuyRequest,
  type MmrLabLookupSession,
} from "./build-mmr-lab-maxbuy-request";

type View =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "ok"; result: MmrVinOk }
  | { kind: "unavailable"; reason: string }
  | { kind: "error"; error: ApiErrorResult };

type Identity =
  | { kind: "vin"; vin: string }
  | { kind: "vehicle"; title: string }
  | null;

const emptySelection: MmrSelection = {
  year: "",
  make: "",
  model: "",
  style: "",
  mileage: "",
};

const emptyCatalog: MmrCatalogOptions = {
  years: [],
  makes: [],
  models: [],
  styles: [],
  catalogState: "connected",
  reason: null,
  loading: "years",
};

const MAXBUY_FETCH_FAILED: MaxbuyEvaluationState = {
  kind: "error",
  message: "Max buy evaluation could not run for this lookup.",
};

function parseMileage(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 2_000_000 ? n : null;
}

function titleFromSelection(selection: MmrSelection): string {
  return [
    selection.year,
    selection.make,
    selection.model,
    selection.style,
  ].filter(Boolean).join(" ");
}

function mmrTransportError(): ApiErrorResult {
  return {
    ok: false,
    kind: "proxy",
    error: "client_fetch_failed",
    message: "Could not reach the server.",
    status: 0,
  };
}

export function MmrLabClient() {
  const [view, setView] = useState<View>({ kind: "empty" });
  const [maxbuyView, setMaxbuyView] = useState<MaxbuyEvaluationState>({ kind: "idle" });
  const [identity, setIdentity] = useState<Identity>(null);
  const [selection, setSelection] = useState<MmrSelection>(emptySelection);
  const [laneAskPrice, setLaneAskPrice] = useState("");
  const [catalog, setCatalog] = useState<MmrCatalogOptions>(emptyCatalog);

  const lookupSessionRef = useRef<MmrLabLookupSession | null>(null);

  const reEvaluateMaxbuy = useCallback((session: MmrLabLookupSession, askPrice: string) => {
    const built = buildMmrLabMaxbuyRequest(session, askPrice);
    if ("error" in built) {
      setMaxbuyView({ kind: "error", message: built.error });
      return;
    }

    setMaxbuyView({ kind: "loading" });
    void postMaxbuyEvaluate(built.body).then((res) => {
      setMaxbuyView(applyMaxbuyResult(res, built.askingPrice));
    });
  }, []);

  const handleLaneAskPriceChange = useCallback(
    (value: string) => {
      setLaneAskPrice(value);
      const session = lookupSessionRef.current;
      if (session) reEvaluateMaxbuy(session, value);
    },
    [reEvaluateMaxbuy],
  );

  useEffect(() => {
    let cancelled = false;
    void getMmrCatalogYears().then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setCatalog((current) => ({
          ...current,
          years: res.data.items,
          catalogState: res.data.catalogState,
          reason: res.data.reason,
          loading: null,
        }));
      } else {
        setCatalog((current) => ({
          ...current,
          years: [],
          catalogState: "not_connected",
          reason: res.error,
          loading: null,
        }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selection.year) return;
    let cancelled = false;
    void getMmrCatalogMakes(selection.year).then((res) => {
      if (cancelled) return;
      setCatalog((current) => ({
        ...current,
        makes: res.ok ? res.data.items : [],
        catalogState: res.ok ? res.data.catalogState : "not_connected",
        reason: res.ok ? res.data.reason : res.error,
        loading: null,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [selection.year]);

  useEffect(() => {
    if (!selection.year || !selection.make) return;
    let cancelled = false;
    void getMmrCatalogModels(selection.year, selection.make).then((res) => {
      if (cancelled) return;
      setCatalog((current) => ({
        ...current,
        models: res.ok ? res.data.items : [],
        catalogState: res.ok ? res.data.catalogState : "not_connected",
        reason: res.ok ? res.data.reason : res.error,
        loading: null,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [selection.year, selection.make]);

  useEffect(() => {
    if (!selection.year || !selection.make || !selection.model) return;
    let cancelled = false;
    void getMmrCatalogStyles(selection.year, selection.make, selection.model).then((res) => {
      if (cancelled) return;
      setCatalog((current) => ({
        ...current,
        styles: res.ok ? res.data.items : [],
        catalogState: res.ok ? res.data.catalogState : "not_connected",
        reason: res.ok ? res.data.reason : res.error,
        loading: null,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [selection.year, selection.make, selection.model]);

  const runParallelLookup = useCallback(
    async (
      session: MmrLabLookupSession,
      mmrPromise: ReturnType<typeof postMmrVin>,
    ) => {
      const built = buildMmrLabMaxbuyRequest(session, laneAskPrice);
      if ("error" in built) {
        setMaxbuyView({ kind: "error", message: built.error });
        const mmrRes = await mmrPromise;
        if (mmrRes.ok) setView({ kind: "ok", result: mmrRes.data });
        else if (mmrRes.kind === "unavailable") setView({ kind: "unavailable", reason: mmrRes.error });
        else setView({ kind: "error", error: mmrRes });
        return;
      }

      lookupSessionRef.current = session;

      setView({ kind: "loading" });
      setMaxbuyView({ kind: "loading" });

      const [mmrSettled, maxbuySettled] = await Promise.allSettled([
        mmrPromise,
        postMaxbuyEvaluate(built.body),
      ]);

      if (mmrSettled.status === "fulfilled") {
        const res = mmrSettled.value;
        if (res.ok) setView({ kind: "ok", result: res.data });
        else if (res.kind === "unavailable") setView({ kind: "unavailable", reason: res.error });
        else setView({ kind: "error", error: res });
      } else {
        setView({ kind: "error", error: mmrTransportError() });
      }

      if (maxbuySettled.status === "fulfilled") {
        setMaxbuyView(applyMaxbuyResult(maxbuySettled.value, built.askingPrice));
      } else {
        setMaxbuyView(MAXBUY_FETCH_FAILED);
      }
    },
    [laneAskPrice],
  );

  const onVinSubmit = useCallback(
    async (vin: string) => {
      setIdentity({ kind: "vin", vin });
      await runParallelLookup({ kind: "vin", vin }, postMmrVin({ vin }));
    },
    [runParallelLookup],
  );

  const onYmmSubmit = useCallback(async () => {
    const mileage = parseMileage(selection.mileage);
    if (!selection.year || !selection.make || !selection.model || !selection.style || mileage === null) {
      return;
    }

    const title = titleFromSelection(selection);
    setIdentity({ kind: "vehicle", title });
    await runParallelLookup(
      { kind: "ymm", selection },
      postMmrYmm({
        year: Number(selection.year),
        make: selection.make,
        model: selection.model,
        style: selection.style,
        mileage,
      }),
    );
  }, [runParallelLookup, selection]);

  const onSelectionChange = useCallback((next: MmrSelection) => {
    if (next.year !== selection.year) {
      setCatalog((current) => ({
        ...current,
        makes: [],
        models: [],
        styles: [],
        loading: next.year ? "makes" : null,
      }));
    } else if (next.make !== selection.make) {
      setCatalog((current) => ({
        ...current,
        models: [],
        styles: [],
        loading: next.make ? "models" : null,
      }));
    } else if (next.model !== selection.model) {
      setCatalog((current) => ({
        ...current,
        styles: [],
        loading: next.model ? "styles" : null,
      }));
    }
    setSelection(next);
  }, [selection.make, selection.model, selection.year]);

  const result = view.kind === "ok" ? view.result : null;
  const lowerSections = lowerSectionStateFromView(view.kind);
  const resultBandPhase =
    view.kind === "loading"
      ? "loading"
      : view.kind === "ok"
        ? "ready"
        : view.kind === "unavailable"
          ? "unavailable"
          : "idle";
  const defaultOdometer =
    parseMileage(selection.mileage) ?? result?.mileageUsed ?? null;

  const retryLookup =
    identity?.kind === "vin"
      ? () => void onVinSubmit(identity.vin)
      : identity?.kind === "vehicle"
        ? () => void onYmmSubmit()
        : undefined;

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-4 sm:space-y-6">
      <SearchPanel
        onVinSubmit={(v) => void onVinSubmit(v)}
        vinPending={view.kind === "loading" && identity?.kind === "vin"}
        selection={selection}
        catalog={catalog}
        onSelectionChange={onSelectionChange}
        onYmmSubmit={() => void onYmmSubmit()}
        ymmPending={view.kind === "loading" && identity?.kind === "vehicle"}
        laneAskPrice={laneAskPrice}
        onLaneAskPriceChange={handleLaneAskPriceChange}
      />

      {identity ? (
        <div className="border-b-4 border-primary px-4 pb-3 text-sm text-muted-foreground sm:px-6">
          {identity.kind === "vehicle" ? (
            <div className="text-lg font-semibold uppercase tracking-tight text-primary sm:text-xl">
              {identity.title}
            </div>
          ) : (
            <>
              VIN: <span className="font-mono">{identity.vin}</span>
            </>
          )}
        </div>
      ) : null}

      {view.kind === "error" ? (
        <div className="px-4 sm:px-6">
          <ErrorState error={view.error} onRetry={retryLookup} />
        </div>
      ) : (
        <ResultBand
          phase={resultBandPhase}
          defaultOdometer={defaultOdometer}
          baseMmr={result?.mmrValue ?? null}
          confidence={result?.confidence ?? null}
          method={result?.method ?? null}
          unavailableReason={view.kind === "unavailable" ? view.reason : null}
          avgOdometer={result?.avgOdometer ?? null}
          avgCondition={result?.avgCondition ?? null}
          rangeLow={result?.rangeLow ?? null}
          rangeHigh={result?.rangeHigh ?? null}
          adjustedMmr={result?.adjustedMmr ?? null}
          retailValue={result?.retailValue ?? null}
          retailRangeLow={result?.retailRangeLow ?? null}
          retailRangeHigh={result?.retailRangeHigh ?? null}
        />
      )}

      <MaxbuyEvaluationSection state={maxbuyView} onRetry={retryLookup} />

      <DataSections state={lowerSections} />
    </div>
  );
}
