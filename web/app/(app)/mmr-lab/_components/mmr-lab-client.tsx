"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { lowerSectionsFromView } from "./mmr-lower-section-state";
import {
  MaxbuyEvaluationSection,
  type MaxbuyEvaluationState,
} from "./maxbuy-evaluation-section";
import { applyMaxbuyResult } from "./apply-maxbuy-result";
import {
  buildMmrLabMaxbuyRequest,
  mmrVinSessionFromResult,
  type MmrLabLookupSession,
} from "./build-mmr-lab-maxbuy-request";
import { buildMmrRecomputeRequest } from "./build-mmr-recompute-request";
import {
  applyYmmCascadeChange,
} from "./apply-ymm-cascade";
import {
  hydrateVinAutofill,
  styleMatchNotice,
} from "./hydrate-vin-autofill";
import {
  EMPTY_MMR_ADJUSTMENTS,
  inferBuildOptionsIncluded,
  parseAdjustmentOdometer,
  seedMmrAdjustmentsFromResult,
  type MmrAdjustments,
} from "./mmr-adjustments";
import {
  buildMmrAdjustmentBaseline,
  deriveMmrAdjustmentDeltas,
  type MmrAdjustmentBaseline,
} from "./mmr-adjustment-display";

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

function syncAdjustmentsFromMmrResult(
  prev: MmrAdjustments,
  result: MmrVinOk,
): MmrAdjustments {
  const seeded = seedMmrAdjustmentsFromResult(result);
  const inferred = inferBuildOptionsIncluded(result);
  const buildOn =
    result.buildOptionsIncluded === true ||
    (result.buildOptionsIncluded !== false && inferred) ||
    seeded.buildOptions;

  return {
    ...prev,
    buildOptions: buildOn,
    buildOptionsUserExcluded:
      result.buildOptionsIncluded === false
        ? true
        : buildOn
          ? false
          : prev.buildOptionsUserExcluded,
    odometer:
      prev.odometer !== ""
        ? prev.odometer
        : seeded.odometer,
  };
}

export function MmrLabClient() {
  const [view, setView] = useState<View>({ kind: "empty" });
  const [maxbuyView, setMaxbuyView] = useState<MaxbuyEvaluationState>({ kind: "idle" });
  const [identity, setIdentity] = useState<Identity>(null);
  const [vinInput, setVinInput] = useState("");
  const [vinLocked, setVinLocked] = useState(false);
  const [styleNotice, setStyleNotice] = useState<string | null>(null);
  const [selection, setSelection] = useState<MmrSelection>(emptySelection);
  const [laneAskPrice, setLaneAskPrice] = useState("");
  const [adjustments, setAdjustments] = useState<MmrAdjustments>(EMPTY_MMR_ADJUSTMENTS);
  const [mmrRecomputing, setMmrRecomputing] = useState(false);
  const [catalog, setCatalog] = useState<MmrCatalogOptions>(emptyCatalog);

  const lookupSessionRef = useRef<MmrLabLookupSession | null>(null);
  const recomputeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [adjustmentBaseline, setAdjustmentBaseline] = useState<MmrAdjustmentBaseline | null>(null);
  // Always-current selection ref — used in async callbacks to avoid stale closures.
  const selectionRef = useRef(selection);
  useLayoutEffect(() => {
    selectionRef.current = selection;
  });

  const reEvaluateMaxbuy = useCallback((
    session: MmrLabLookupSession,
    askPrice: string,
    adj?: MmrAdjustments,
  ) => {
    const built = buildMmrLabMaxbuyRequest(session, askPrice, adj);
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
      if (session) reEvaluateMaxbuy(session, value, adjustments);
    },
    [reEvaluateMaxbuy, adjustments],
  );

  const applyMmrResult = useCallback((data: MmrVinOk, prevAdj: MmrAdjustments) => {
    const baseline = buildMmrAdjustmentBaseline(data);
    if (baseline) setAdjustmentBaseline(baseline);
    setView({ kind: "ok", result: data });
    setAdjustments((prev) => syncAdjustmentsFromMmrResult({ ...prev, ...prevAdj }, data));
  }, []);

  const runMmrRecompute = useCallback(
    async (session: MmrLabLookupSession, adj: MmrAdjustments) => {
      const request = buildMmrRecomputeRequest(session, adj);
      setMmrRecomputing(true);
      try {
        const mmrRes =
          session.kind === "vin"
            ? await postMmrVin(request as Extract<typeof request, { vin: string }>)
            : await postMmrYmm(request as Extract<typeof request, { year: number }>);
        if (mmrRes.ok) applyMmrResult(mmrRes.data, adj);
        else if (mmrRes.kind === "unavailable") setView({ kind: "unavailable", reason: mmrRes.error });
        else setView({ kind: "error", error: mmrRes });
      } finally {
        setMmrRecomputing(false);
      }

      if (parseAdjustmentOdometer(adj.odometer) !== null) {
        reEvaluateMaxbuy(session, laneAskPrice, adj);
      }
    },
    [applyMmrResult, laneAskPrice, reEvaluateMaxbuy],
  );

  const handleAdjustmentsChange = useCallback(
    (next: MmrAdjustments) => {
      setAdjustments(next);
      const session = lookupSessionRef.current;
      if (!session) return;

      if (recomputeTimerRef.current) clearTimeout(recomputeTimerRef.current);
      recomputeTimerRef.current = setTimeout(() => {
        void runMmrRecompute(session, next);
      }, 400);
    },
    [runMmrRecompute],
  );

  const handleAdjustmentsClear = useCallback(() => {
    const session = lookupSessionRef.current;
    if (!session) return;
    const resetAdj =
      view.kind === "ok"
        ? seedMmrAdjustmentsFromResult(view.result)
        : EMPTY_MMR_ADJUSTMENTS;
    setAdjustments(resetAdj);
    if (recomputeTimerRef.current) clearTimeout(recomputeTimerRef.current);
    void runMmrRecompute(session, resetAdj);
  }, [runMmrRecompute, view]);

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
      const makes = res.ok ? res.data.items : [];
      setCatalog((current) => ({
        ...current,
        makes,
        catalogState: res.ok ? res.data.catalogState : "not_connected",
        reason: res.ok ? res.data.reason : res.error,
        loading: null,
      }));
      // If the preserved make is not offered for the new year, clear it and downstream.
      const currentMake = selectionRef.current.make;
      if (currentMake && !makes.includes(currentMake)) {
        setSelection((s) => ({ ...s, make: "", model: "", style: "" }));
        setCatalog((c) => ({ ...c, models: [], styles: [] }));
      }
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
      const models = res.ok ? res.data.items : [];
      setCatalog((current) => ({
        ...current,
        models,
        catalogState: res.ok ? res.data.catalogState : "not_connected",
        reason: res.ok ? res.data.reason : res.error,
        loading: null,
      }));
      // If the preserved model is not offered for the new year+make, clear it and downstream.
      const currentModel = selectionRef.current.model;
      if (currentModel && !models.includes(currentModel)) {
        setSelection((s) => ({ ...s, model: "", style: "" }));
        setCatalog((c) => ({ ...c, styles: [] }));
      }
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

  const applyVinAutofill = useCallback(
    async (result: MmrVinOk) => {
      let years = catalog.years;
      if (years.length === 0) {
        const yearsRes = await getMmrCatalogYears();
        if (!yearsRes.ok) return;
        years = yearsRes.data.items;
      }

      const autofill = await hydrateVinAutofill(result, years);
      if (!autofill) return;

      setSelection(autofill.selection);
      setCatalog((current) => ({
        ...current,
        years: autofill.catalog.years.length > 0 ? autofill.catalog.years : current.years,
        makes: autofill.catalog.makes,
        models: autofill.catalog.models,
        styles: autofill.catalog.styles,
        loading: null,
      }));
      setStyleNotice(styleMatchNotice(autofill.styleMatch, autofill.coxTrim));
    },
    [catalog.years],
  );

  const runParallelLookup = useCallback(
    async (
      session: MmrLabLookupSession,
      mmrPromise: ReturnType<typeof postMmrVin>,
    ) => {
      lookupSessionRef.current = session;
      setAdjustmentBaseline(null);
      setAdjustments(EMPTY_MMR_ADJUSTMENTS);
      setView({ kind: "loading" });
      setMaxbuyView({ kind: "loading" });

      if (session.kind === "vin") {
        let mmrRes;
        try {
          mmrRes = await mmrPromise;
        } catch {
          setView({ kind: "error", error: mmrTransportError() });
          setMaxbuyView(MAXBUY_FETCH_FAILED);
          return;
        }

        if (!mmrRes.ok) {
          if (mmrRes.kind === "unavailable") {
            setView({ kind: "unavailable", reason: mmrRes.error });
          } else {
            setView({ kind: "error", error: mmrRes });
          }
          setMaxbuyView(MAXBUY_FETCH_FAILED);
          return;
        }

        applyMmrResult(mmrRes.data, EMPTY_MMR_ADJUSTMENTS);
        setVinLocked(true);
        void applyVinAutofill(mmrRes.data);

        const maxbuySession = mmrVinSessionFromResult(session.vin, mmrRes.data);
        lookupSessionRef.current = maxbuySession;

        const built = buildMmrLabMaxbuyRequest(maxbuySession, laneAskPrice);
        if ("error" in built) {
          setMaxbuyView({ kind: "error", message: built.error });
          return;
        }

        try {
          const maxbuyRes = await postMaxbuyEvaluate(built.body);
          setMaxbuyView(applyMaxbuyResult(maxbuyRes, built.askingPrice));
        } catch {
          setMaxbuyView(MAXBUY_FETCH_FAILED);
        }
        return;
      }

      const built = buildMmrLabMaxbuyRequest(session, laneAskPrice);
      if ("error" in built) {
        setMaxbuyView({ kind: "error", message: built.error });
        const mmrRes = await mmrPromise;
        if (mmrRes.ok) setView({ kind: "ok", result: mmrRes.data });
        else if (mmrRes.kind === "unavailable") setView({ kind: "unavailable", reason: mmrRes.error });
        else setView({ kind: "error", error: mmrRes });
        return;
      }

      const [mmrSettled, maxbuySettled] = await Promise.allSettled([
        mmrPromise,
        postMaxbuyEvaluate(built.body),
      ]);

      if (mmrSettled.status === "fulfilled") {
        const res = mmrSettled.value;
        if (res.ok) applyMmrResult(res.data, EMPTY_MMR_ADJUSTMENTS); else if (res.kind === "unavailable") setView({ kind: "unavailable", reason: res.error });
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
    [applyMmrResult, laneAskPrice, applyVinAutofill],
  );

  const onVinSubmit = useCallback(
    async (vin: string) => {
      setIdentity({ kind: "vin", vin });
      setVinInput(vin);
      setStyleNotice(null);
      await runParallelLookup({ kind: "vin", vin }, postMmrVin({ vin }));
    },
    [runParallelLookup],
  );

  const onVinReset = useCallback(() => {
    setVinLocked(false);
    setVinInput("");
    setStyleNotice(null);
    setSelection(emptySelection);
    setIdentity(null);
    setView({ kind: "empty" });
    setMaxbuyView({ kind: "idle" });
    setAdjustments(EMPTY_MMR_ADJUSTMENTS);
    lookupSessionRef.current = null;
    setCatalog((current) => ({
      ...current,
      makes: [],
      models: [],
      styles: [],
      loading: null,
    }));
  }, []);

  const onYmmSubmit = useCallback(async () => {
    if (!selection.year || !selection.make || !selection.model || !selection.style) {
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
      }),
    );
  }, [runParallelLookup, selection]);

  const onSelectionChange = useCallback((next: MmrSelection) => {
    const merged = applyYmmCascadeChange(selection, next);

    if (merged.year !== selection.year) {
      setStyleNotice(null);
      // Keep existing catalog arrays visible while re-fetching for the new year.
      // The makes/models useEffect callbacks will clear invalid downstream selections
      // once the new catalog data arrives.
      setCatalog((current) => ({
        ...current,
        loading: merged.year ? "makes" : null,
      }));
    } else if (merged.make !== selection.make) {
      setStyleNotice(null);
      setCatalog((current) => ({
        ...current,
        models: [],
        styles: [],
        loading: merged.make ? "models" : null,
      }));
    } else if (merged.model !== selection.model) {
      setStyleNotice(null);
      setCatalog((current) => ({
        ...current,
        styles: [],
        loading: merged.model ? "styles" : null,
      }));
    } else if (merged.style !== selection.style) {
      setStyleNotice(null);
    }
    setSelection(merged);
  }, [selection]);

  const result = view.kind === "ok" ? view.result : null;
  const adjustmentDeltas = result
    ? deriveMmrAdjustmentDeltas({
        baseMmr: result.mmrValue,
        adjustedMmr: result.adjustedMmr ?? null,
        buildOptionsIncluded: result.buildOptionsIncluded,
        buildOptionsAdjustment: result.buildOptionsAdjustment ?? null,
        odometerAdjustment: result.odometerAdjustment ?? null,
        adjustments,
        baseline: adjustmentBaseline,
      })
    : { odometerAdjustment: null, buildOptionsAdjustment: null };
  const lowerSections = lowerSectionsFromView(view.kind, result);
  const resultBandPhase =
    view.kind === "loading"
      ? "loading"
      : mmrRecomputing
        ? "recomputing"
        : view.kind === "ok"
          ? "ready"
          : view.kind === "unavailable"
            ? "unavailable"
            : "idle";
  const retryLookup =
    identity?.kind === "vin"
      ? () => void onVinSubmit(identity.vin)
      : identity?.kind === "vehicle"
        ? () => void onYmmSubmit()
        : undefined;

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-4 sm:space-y-6">
      <SearchPanel
        vin={vinInput}
        onVinChange={setVinInput}
        vinReadOnly={vinLocked}
        onVinReset={vinLocked ? onVinReset : undefined}
        onVinSubmit={(v) => void onVinSubmit(v)}
        vinPending={view.kind === "loading" && identity?.kind === "vin"}
        selection={selection}
        catalog={catalog}
        onSelectionChange={onSelectionChange}
        onYmmSubmit={() => void onYmmSubmit()}
        ymmPending={view.kind === "loading" && identity?.kind === "vehicle"}
        laneAskPrice={laneAskPrice}
        onLaneAskPriceChange={handleLaneAskPriceChange}
        styleMatchNotice={styleNotice}
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
          adjustments={adjustments}
          onAdjustmentsChange={handleAdjustmentsChange}
          onAdjustmentsClear={handleAdjustmentsClear}
          baseMmr={result?.mmrValue ?? null}
          confidence={result?.confidence ?? null}
          method={result?.method ?? null}
          unavailableReason={view.kind === "unavailable" ? view.reason : null}
          avgOdometer={result?.avgOdometer ?? null}
          avgCondition={result?.avgCondition ?? null}
          rangeLow={result?.rangeLow ?? null}
          rangeHigh={result?.rangeHigh ?? null}
          adjustedMmr={result?.adjustedMmr ?? null}
          odometerAdjustment={adjustmentDeltas.odometerAdjustment}
          buildOptionsAdjustment={adjustmentDeltas.buildOptionsAdjustment}
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
