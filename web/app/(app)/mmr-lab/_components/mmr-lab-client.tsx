"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
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
  parseAdjustmentOdometer,
  resolveBuildOptionsState,
  seedMmrAdjustmentsFromResult,
  type MmrAdjustments,
} from "./mmr-adjustments";
import {
  applyAttributeMarginalDelta,
  buildMmrAdjustmentBaseline,
  deriveMmrAdjustmentDeltas,
  detectAttributeMarginalChanges,
  EMPTY_MMR_ATTRIBUTE_MARGINALS,
  type MmrAdjustmentBaseline,
  type MmrAttributeMarginals,
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
  const buildState = resolveBuildOptionsState(prev, result);

  return {
    ...prev,
    ...buildState,
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

  const [recentlyCleared, setRecentlyCleared] = useState<Set<"make" | "model" | "style">>(
    new Set(),
  );
  const recentlyClearedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markCleared = useCallback((fields: ("make" | "model" | "style")[]) => {
    if (fields.length === 0) return;
    if (recentlyClearedTimerRef.current) clearTimeout(recentlyClearedTimerRef.current);
    setRecentlyCleared(new Set(fields));
    recentlyClearedTimerRef.current = setTimeout(() => setRecentlyCleared(new Set()), 1500);
  }, []);

  const lookupSessionRef = useRef<MmrLabLookupSession | null>(null);
  const recomputeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [adjustmentBaseline, setAdjustmentBaseline] = useState<MmrAdjustmentBaseline | null>(null);
  const [attributeMarginals, setAttributeMarginals] = useState<MmrAttributeMarginals>(
    EMPTY_MMR_ATTRIBUTE_MARGINALS,
  );
  const pendingMarginalChangesRef = useRef<(keyof MmrAttributeMarginals)[]>([]);
  // Always-current refs — used in async callbacks to avoid stale closures.
  const selectionRef = useRef(selection);
  const laneAskPriceRef = useRef(laneAskPrice);
  const adjustmentsRef = useRef(adjustments);
  useLayoutEffect(() => {
    selectionRef.current = selection;
    laneAskPriceRef.current = laneAskPrice;
    adjustmentsRef.current = adjustments;
  });

  // Auto-scroll to results on mobile (Item 4) when a result arrives.
  useEffect(() => {
    if (view.kind !== "ok") return;
    if (typeof window === "undefined" || window.innerWidth >= 768) return;
    document.getElementById("mmr-result-band")?.scrollIntoView({ behavior: "smooth" });
  }, [view.kind]);

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
    setView((currentView) => {
      if (currentView.kind === "ok") {
        setAttributeMarginals((prev) =>
          applyAttributeMarginalDelta(
            prev,
            pendingMarginalChangesRef.current,
            currentView.result.adjustedMmr ?? null,
            data.adjustedMmr ?? null,
          ),
        );
      }
      return { kind: "ok", result: data };
    });
    pendingMarginalChangesRef.current = [];
    const baseline = buildMmrAdjustmentBaseline(data);
    if (baseline) setAdjustmentBaseline(baseline);
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
      const newChanges = detectAttributeMarginalChanges(adjustments, next);
      // Accumulate — don't overwrite — so grade/color/region changes aren't lost
      // when the user also adjusts odometer before the debounce fires.
      pendingMarginalChangesRef.current = Array.from(
        new Set([...pendingMarginalChangesRef.current, ...newChanges]),
      );
      setAdjustments(next);
      const session = lookupSessionRef.current;
      if (!session) return;

      if (recomputeTimerRef.current) clearTimeout(recomputeTimerRef.current);
      recomputeTimerRef.current = setTimeout(() => {
        void runMmrRecompute(session, next);
      }, 400);
    },
    [adjustments, runMmrRecompute],
  );

  const handleAdjustmentsClear = useCallback(() => {
    const session = lookupSessionRef.current;
    if (!session) return;
    const resetAdj =
      view.kind === "ok"
        ? seedMmrAdjustmentsFromResult(view.result)
        : EMPTY_MMR_ADJUSTMENTS;
    pendingMarginalChangesRef.current = [];
    setAttributeMarginals(EMPTY_MMR_ATTRIBUTE_MARGINALS);
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
        markCleared(["make", "model", "style"]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selection.year, markCleared]);

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
        markCleared(["model", "style"]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selection.year, selection.make, markCleared]);

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

      // If the VIN session was sent to MaxBuy without make/model (Manheim payload
      // didn't include them), retry MaxBuy now that the catalog has resolved them.
      const session = lookupSessionRef.current;
      if (session?.kind === "vin" && !session.make) {
        const enriched: MmrLabLookupSession = {
          ...session,
          year: Number(autofill.selection.year),
          make: autofill.selection.make,
          model: autofill.selection.model,
          ...(autofill.selection.style ? { trim: autofill.selection.style } : {}),
        };
        lookupSessionRef.current = enriched;
        reEvaluateMaxbuy(enriched, laneAskPriceRef.current, adjustmentsRef.current);
      }
    },
    [catalog.years, reEvaluateMaxbuy],
  );

  const runParallelLookup = useCallback(
    async (
      session: MmrLabLookupSession,
      mmrPromise: ReturnType<typeof postMmrVin>,
    ) => {
      lookupSessionRef.current = session;
      setAdjustmentBaseline(null);
      setAdjustments(EMPTY_MMR_ADJUSTMENTS);
    setAttributeMarginals(EMPTY_MMR_ATTRIBUTE_MARGINALS);
    pendingMarginalChangesRef.current = [];
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
    setAttributeMarginals(EMPTY_MMR_ATTRIBUTE_MARGINALS);
    pendingMarginalChangesRef.current = [];
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
        gradeAdjustment: result.gradeAdjustment ?? null,
        colorAdjustment: result.colorAdjustment ?? null,
        regionAdjustment: result.regionAdjustment ?? null,
        adjustments,
        baseline: adjustmentBaseline,
        attributeMarginals,
      })
    : {
        odometerAdjustment: null,
        buildOptionsAdjustment: null,
        gradeAdjustment: null,
        colorAdjustment: null,
        regionAdjustment: null,
      };
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

  // MaxBuy-specific retry: re-evaluates using the current session enriched with
  // catalog YMM when the session was originally missing make/model (e.g. the
  // Manheim payload didn't include vehicle identity fields for this VIN).
  const onMaxbuyRetry = useCallback(() => {
    const session = lookupSessionRef.current;
    if (!session) {
      retryLookup?.();
      return;
    }
    const sel = selectionRef.current;
    const enriched: MmrLabLookupSession =
      session.kind === "vin" && !session.make && sel.year && sel.make && sel.model
        ? {
            ...session,
            year: Number(sel.year),
            make: sel.make,
            model: sel.model,
            ...(sel.style ? { trim: sel.style } : {}),
          }
        : session;
    lookupSessionRef.current = enriched;
    reEvaluateMaxbuy(enriched, laneAskPriceRef.current, adjustmentsRef.current);
  }, [reEvaluateMaxbuy, retryLookup]);

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-4 sm:space-y-6">
      {/* Sticky panel on desktop (Item 5) */}
      <div className="sticky top-0 z-10">
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
          recentlyCleared={recentlyCleared}
        />
      </div>

      {/* Dismissible style approximation notice (Item 7) */}
      {styleNotice ? (
        <div className="px-4 sm:px-6">
          <Alert variant="amber" onDismiss={() => setStyleNotice(null)}>
            {styleNotice}
          </Alert>
        </div>
      ) : null}

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
        <div id="mmr-result-band">
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
          gradeAdjustment={adjustmentDeltas.gradeAdjustment}
          colorAdjustment={adjustmentDeltas.colorAdjustment}
          regionAdjustment={adjustmentDeltas.regionAdjustment}
          retailValue={result?.retailValue ?? null}
          retailRangeLow={result?.retailRangeLow ?? null}
          retailRangeHigh={result?.retailRangeHigh ?? null}
        />
        </div>
      )}

      <MaxbuyEvaluationSection state={maxbuyView} onRetry={onMaxbuyRetry} />

      <DataSections state={lowerSections} />
    </div>
  );
}
