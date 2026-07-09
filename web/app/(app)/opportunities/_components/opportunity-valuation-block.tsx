"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  postMaxbuyEvaluate,
  postMmrVin,
  postMmrYmm,
  type MmrVinRequest,
  type MmrYmmRequest,
} from "@/lib/app-api/client";
import type { ApiResult } from "@/lib/app-api";
import type {
  MmrVinOk,
  OpportunityDetail,
} from "@/lib/app-api/schemas";
import { ErrorState, type ApiErrorResult } from "@/components/data-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { MaxbuySummaryCard } from "./maxbuy-summary-card";
import { MmrSummaryCard } from "./mmr-summary-card";
import {
  type ResultBandPhase,
} from "../../mmr-lab/_components/result-band";
import {
  type MaxbuyEvaluationState,
} from "../../mmr-lab/_components/maxbuy-evaluation-section";
import { applyMaxbuyResult } from "../../mmr-lab/_components/apply-maxbuy-result";
import {
  buildMmrLabMaxbuyRequest,
  mmrVinSessionFromResult,
  type MmrLabLookupSession,
} from "../../mmr-lab/_components/build-mmr-lab-maxbuy-request";
import { buildMmrRecomputeRequest } from "../../mmr-lab/_components/build-mmr-recompute-request";
import {
  EMPTY_MMR_ADJUSTMENTS,
  parseAdjustmentOdometer,
  resolveBuildOptionsState,
  seedMmrAdjustmentsFromResult,
  type MmrAdjustments,
} from "../../mmr-lab/_components/mmr-adjustments";
import {
  applyAttributeMarginalDelta,
  buildMmrAdjustmentBaseline,
  deriveMmrAdjustmentDeltas,
  detectAttributeMarginalChanges,
  EMPTY_MMR_ATTRIBUTE_MARGINALS,
  type MmrAdjustmentBaseline,
  type MmrAttributeMarginals,
} from "../../mmr-lab/_components/mmr-adjustment-display";

type MmrView =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "ok"; result: MmrVinOk }
  | { kind: "unavailable"; reason: string }
  | { kind: "error"; error: ApiErrorResult };

const MAXBUY_FETCH_FAILED: MaxbuyEvaluationState = {
  kind: "error",
  message: "Max buy evaluation could not run for this lookup.",
};

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
    odometer: prev.odometer !== "" ? prev.odometer : seeded.odometer,
  };
}

/** Build a lookup session from the opportunity's vehicle identity. */
function sessionFromOpportunity(
  opportunity: OpportunityDetail,
): MmrLabLookupSession | null {
  const vin = opportunity.vin?.trim();
  if (vin) {
    const session: MmrLabLookupSession = { kind: "vin", vin };
    if (opportunity.year != null) session.year = opportunity.year;
    if (opportunity.make) session.make = opportunity.make;
    if (opportunity.model) session.model = opportunity.model;
    if (opportunity.style) session.trim = opportunity.style;
    return session;
  }

  if (
    opportunity.year != null &&
    opportunity.make &&
    opportunity.model &&
    opportunity.style
  ) {
    return {
      kind: "ymm",
      selection: {
        year: String(opportunity.year),
        make: opportunity.make,
        model: opportunity.model,
        style: opportunity.style,
      },
    };
  }

  return null;
}

/** MMR auto-run: VIN or saved Y/M/M/S (series). Odometer not required. */
function identitySufficientForMmrAutoRun(opportunity: OpportunityDetail): boolean {
  if (opportunity.vin?.trim()) return true;
  return (
    opportunity.year != null &&
    !!opportunity.make &&
    !!opportunity.model &&
    !!opportunity.style
  );
}

/** Max buy auto-run: stricter — YMM path needs mileage + asking price. */
function identitySufficientForMaxbuyAutoRun(opportunity: OpportunityDetail): boolean {
  if (opportunity.vin?.trim()) return true;
  return (
    opportunity.year != null &&
    !!opportunity.make &&
    !!opportunity.model &&
    opportunity.mileage != null &&
    opportunity.price != null
  );
}

function shouldAutoRunMmr(opportunity: OpportunityDetail): boolean {
  return (
    sessionFromOpportunity(opportunity) !== null &&
    identitySufficientForMmrAutoRun(opportunity)
  );
}

function shouldAutoRunMaxbuy(opportunity: OpportunityDetail): boolean {
  return (
    sessionFromOpportunity(opportunity) !== null &&
    identitySufficientForMaxbuyAutoRun(opportunity)
  );
}

/** Explicit refresh runs Max buy whenever we can evaluate (VIN or full YMM identity). */
function shouldRunMaxbuyOnFreshLookup(opportunity: OpportunityDetail): boolean {
  const session = sessionFromOpportunity(opportunity);
  if (!session) return false;
  if (identitySufficientForMaxbuyAutoRun(opportunity)) return true;
  if (session.kind === "vin") return true;
  return false;
}

async function fetchMmrForSession(
  session: MmrLabLookupSession,
  opts?: { refresh?: boolean; adjustments?: MmrAdjustments },
): Promise<ApiResult<MmrVinOk>> {
  const refresh = opts?.refresh === true;
  const adj = opts?.adjustments ?? EMPTY_MMR_ADJUSTMENTS;

  try {
    if (refresh) {
      const request = buildMmrRecomputeRequest(session, adj);
      const refreshFlag = { refresh_valuation: true as const };
      if (session.kind === "vin") {
        return await postMmrVin({
          ...(request as MmrVinRequest),
          ...refreshFlag,
        });
      }
      return await postMmrYmm({
        ...(request as MmrYmmRequest),
        ...refreshFlag,
      });
    }

    if (session.kind === "vin") {
      return await postMmrVin({ vin: session.vin });
    }
    return await postMmrYmm({
      year: Number(session.selection.year),
      make: session.selection.make,
      model: session.selection.model,
      style: session.selection.style,
    });
  } catch {
    return mmrTransportError();
  }
}

function initialMmrAdjustments(opportunity: OpportunityDetail): MmrAdjustments {
  return {
    ...EMPTY_MMR_ADJUSTMENTS,
    odometer:
      opportunity.mileage != null && opportunity.mileage > 0
        ? String(opportunity.mileage)
        : "",
  };
}

function laneAskPriceFromOpportunity(opportunity: OpportunityDetail): string {
  return opportunity.price != null ? String(opportunity.price) : "";
}

/** Placeholder copy when MMR can run but Max buy auto-run identity is insufficient. */
function maxbuyPlaceholderMessage(opportunity: OpportunityDetail): string | null {
  if (opportunity.maxbuySummary) return null;
  if (identitySufficientForMaxbuyAutoRun(opportunity)) return null;
  if (!identitySufficientForMmrAutoRun(opportunity)) return null;
  if (opportunity.vin?.trim()) return null;

  const missing: string[] = [];
  if (opportunity.mileage == null) missing.push("mileage");
  if (opportunity.price == null) missing.push("asking price");
  if (missing.length === 0) {
    return "Max buy needs sufficient vehicle identity.";
  }
  return `Add ${missing.join(" and ")} to run Max buy on this deal.`;
}

function InsufficientIdentityNote({ kind }: { kind: "mmr" | "maxbuy" | "both" }) {
  const message =
    kind === "mmr"
      ? "Add a VIN or year/make/model/series to run MMR on this deal."
      : kind === "maxbuy"
        ? "Max buy needs a VIN, or year/make/model with mileage and asking price."
        : "Add vehicle identity to run MMR and Max buy on this deal.";
  return (
    <Card className="border-dashed bg-surface-sunken">
      <CardContent className="flex items-start gap-2 py-6 text-sm text-muted-foreground">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{message}</span>
      </CardContent>
    </Card>
  );
}

export function OpportunityValuationBlock({
  opportunity,
}: {
  opportunity: OpportunityDetail;
}) {
  const savedVerdict = opportunity.maxbuySummary ?? null;
  const autoRunMmrOnMount = shouldAutoRunMmr(opportunity);
  const autoRunMaxbuyOnMount = shouldAutoRunMaxbuy(opportunity) && !savedVerdict;
  const [preferLiveMaxbuy, setPreferLiveMaxbuy] = useState(false);
  const [view, setView] = useState<MmrView>(() =>
    autoRunMmrOnMount ? { kind: "loading" } : { kind: "empty" },
  );
  const [maxbuyView, setMaxbuyView] = useState<MaxbuyEvaluationState>(() =>
    autoRunMaxbuyOnMount ? { kind: "loading" } : { kind: "idle" },
  );
  const [adjustments, setAdjustments] = useState<MmrAdjustments>(() =>
    initialMmrAdjustments(opportunity),
  );
  const [syncedOpportunityMileage, setSyncedOpportunityMileage] = useState(
    opportunity.mileage,
  );
  const [mmrRecomputing, setMmrRecomputing] = useState(false);

  const [adjustmentBaseline, setAdjustmentBaseline] =
    useState<MmrAdjustmentBaseline | null>(null);
  const [attributeMarginals, setAttributeMarginals] = useState<MmrAttributeMarginals>(
    EMPTY_MMR_ATTRIBUTE_MARGINALS,
  );

  const lookupSessionRef = useRef<MmrLabLookupSession | null>(null);
  const lookupRequestIdRef = useRef(0);
  const recomputeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMarginalChangesRef = useRef<(keyof MmrAttributeMarginals)[]>([]);
  const laneAskPriceRef = useRef<string>(laneAskPriceFromOpportunity(opportunity));
  const adjustmentsRef = useRef(adjustments);
  const viewRef = useRef(view);
  const maxbuyViewRef = useRef(maxbuyView);
  useLayoutEffect(() => {
    adjustmentsRef.current = adjustments;
  });
  useLayoutEffect(() => {
    laneAskPriceRef.current = laneAskPriceFromOpportunity(opportunity);
  });
  useLayoutEffect(() => {
    viewRef.current = view;
  });
  useLayoutEffect(() => {
    maxbuyViewRef.current = maxbuyView;
  });

  // Keep valuation odometer aligned when the parent passes refreshed mileage
  // (e.g. vehicle blur-save). During-render sync avoids setState in useEffect.
  if (syncedOpportunityMileage !== opportunity.mileage) {
    setSyncedOpportunityMileage(opportunity.mileage);
    setAdjustments((prev) => {
      const nextOdometer =
        opportunity.mileage != null && opportunity.mileage > 0
          ? String(opportunity.mileage)
          : prev.odometer;
      if (nextOdometer === prev.odometer) return prev;
      return { ...prev, odometer: nextOdometer };
    });
  }

  const applyMmrResult = useCallback((data: MmrVinOk, prevAdj: MmrAdjustments) => {
    const pendingChanges = pendingMarginalChangesRef.current.slice();
    pendingMarginalChangesRef.current = [];
    setView((currentView) => {
      if (currentView.kind === "ok") {
        setAttributeMarginals((prev) =>
          applyAttributeMarginalDelta(
            prev,
            pendingChanges,
            currentView.result.adjustedMmr ?? null,
            data.adjustedMmr ?? null,
          ),
        );
      }
      return { kind: "ok", result: data };
    });
    const baseline = buildMmrAdjustmentBaseline(data);
    if (baseline) setAdjustmentBaseline(baseline);
    setAdjustments((prev) => syncAdjustmentsFromMmrResult({ ...prev, ...prevAdj }, data));
  }, []);

  const reEvaluateMaxbuy = useCallback(
    (session: MmrLabLookupSession, askPrice: string, adj?: MmrAdjustments) => {
      setPreferLiveMaxbuy(true);
      const built = buildMmrLabMaxbuyRequest(session, askPrice, adj);
      if ("error" in built) {
        setMaxbuyView({ kind: "error", message: built.error });
        return;
      }
      setMaxbuyView({ kind: "loading" });
      void postMaxbuyEvaluate(built.body).then((res) => {
        setMaxbuyView(applyMaxbuyResult(res, built.askingPrice));
      });
    },
    [],
  );

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
        else if (mmrRes.kind === "unavailable")
          setView({ kind: "unavailable", reason: mmrRes.error });
        else setView({ kind: "error", error: mmrRes });
      } finally {
        setMmrRecomputing(false);
      }
      if (parseAdjustmentOdometer(adj.odometer) !== null) {
        reEvaluateMaxbuy(session, laneAskPriceRef.current, adj);
      }
    },
    [applyMmrResult, reEvaluateMaxbuy],
  );

  const runLookup = useCallback(
    async (
      session: MmrLabLookupSession,
      opts?: { runMaxbuy?: boolean; refresh?: boolean; requestId?: number },
    ) => {
      const runMaxbuy = opts?.runMaxbuy ?? true;
      const refresh = opts?.refresh === true;
      const requestId = opts?.requestId ?? ++lookupRequestIdRef.current;
      lookupRequestIdRef.current = requestId;

      const isCurrentRequest = () => requestId === lookupRequestIdRef.current;

      // Snapshot prior UI so a failed refresh does not wipe a good valuation
      // (NEXT_STEPS #50 — Refresh cleared cards to empty/error with no recovery).
      const priorMmrView = viewRef.current;
      const priorMaxbuyView = maxbuyViewRef.current;
      const keepPriorOnRefresh = refresh && priorMmrView.kind === "ok";

      lookupSessionRef.current = session;
      if (!keepPriorOnRefresh) {
        setAdjustmentBaseline(null);
        setAttributeMarginals(EMPTY_MMR_ATTRIBUTE_MARGINALS);
      }
      pendingMarginalChangesRef.current = [];

      const adjForFetch = refresh
        ? adjustmentsRef.current
        : initialMmrAdjustments(opportunity);
      if (!refresh) {
        setAdjustments(adjForFetch);
      }

      if (keepPriorOnRefresh) {
        // Keep summary cards mounted; show recomputing affordance instead of blank skeletons.
        setMmrRecomputing(true);
      } else {
        setView({ kind: "loading" });
        setMaxbuyView(runMaxbuy ? { kind: "loading" } : { kind: "idle" });
      }

      try {
        const mmrRes = await fetchMmrForSession(session, {
          refresh,
          adjustments: adjForFetch,
        });

        if (!isCurrentRequest()) return;

        if (!mmrRes.ok) {
          if (keepPriorOnRefresh) {
            setView(priorMmrView);
            setMaxbuyView(priorMaxbuyView);
            toast.error(
              mmrRes.kind === "unavailable"
                ? "Valuation refresh unavailable — showing last result."
                : "Valuation refresh failed — showing last result.",
            );
            return;
          }
          if (mmrRes.kind === "unavailable") {
            setView({ kind: "unavailable", reason: mmrRes.error });
          } else {
            setView({ kind: "error", error: mmrRes });
          }
          setMaxbuyView(runMaxbuy ? MAXBUY_FETCH_FAILED : { kind: "idle" });
          return;
        }

        applyMmrResult(mmrRes.data, refresh ? adjForFetch : EMPTY_MMR_ADJUSTMENTS);

        if (!runMaxbuy) return;

        // Enrich VIN session with Cox YMM before Max buy when Cox omitted identity.
        const maxbuySession =
          session.kind === "vin"
            ? mmrVinSessionFromResult(session.vin, mmrRes.data)
            : session;
        lookupSessionRef.current = maxbuySession;

        const built = buildMmrLabMaxbuyRequest(
          maxbuySession,
          laneAskPriceRef.current,
          adjForFetch,
        );
        if ("error" in built) {
          if (keepPriorOnRefresh) {
            setMaxbuyView(priorMaxbuyView);
            toast.error(built.error);
            return;
          }
          setPreferLiveMaxbuy(true);
          setMaxbuyView({ kind: "error", message: built.error });
          return;
        }

        // Switch to live Max buy only once we are about to fetch — keeps saved
        // card visible through the MMR portion of a refresh.
        setPreferLiveMaxbuy(true);
        if (!keepPriorOnRefresh || priorMaxbuyView.kind !== "ready") {
          setMaxbuyView({ kind: "loading" });
        }
        try {
          const maxbuyRes = await postMaxbuyEvaluate(built.body);
          if (!isCurrentRequest()) return;
          setMaxbuyView(applyMaxbuyResult(maxbuyRes, built.askingPrice));
        } catch {
          if (!isCurrentRequest()) return;
          if (keepPriorOnRefresh && priorMaxbuyView.kind === "ready") {
            setMaxbuyView(priorMaxbuyView);
            toast.error("Max buy refresh failed — showing last result.");
            return;
          }
          if (keepPriorOnRefresh && priorMaxbuyView.kind === "idle") {
            // Restore saved-card path when live fetch fails after a refresh.
            setPreferLiveMaxbuy(false);
            setMaxbuyView({ kind: "idle" });
            toast.error("Max buy refresh failed — showing last result.");
            return;
          }
          setMaxbuyView(MAXBUY_FETCH_FAILED);
        }
      } finally {
        if (isCurrentRequest()) {
          setMmrRecomputing(false);
        }
      }
    },
    [applyMmrResult, opportunity],
  );

  // Auto-run MMR when identity supports a lookup. Initial view is already
  // "loading" from useState — this effect only performs async fetch + setState
  // in await callbacks (react-hooks/set-state-in-effect compliant).
  useEffect(() => {
    if (!autoRunMmrOnMount) return;
    const session = sessionFromOpportunity(opportunity);
    if (!session) return;

    lookupSessionRef.current = session;
    const runMaxbuy = autoRunMaxbuyOnMount;
    const requestId = ++lookupRequestIdRef.current;
    let cancelled = false;

    void (async () => {
      const mmrRes = await fetchMmrForSession(session);
      if (cancelled || requestId !== lookupRequestIdRef.current) return;

      if (!mmrRes.ok) {
        if (mmrRes.kind === "unavailable") {
          setView({ kind: "unavailable", reason: mmrRes.error });
        } else {
          setView({ kind: "error", error: mmrRes });
        }
        setMaxbuyView(runMaxbuy ? MAXBUY_FETCH_FAILED : { kind: "idle" });
        return;
      }

      applyMmrResult(mmrRes.data, EMPTY_MMR_ADJUSTMENTS);
      if (!runMaxbuy) return;

      const maxbuySession =
        session.kind === "vin"
          ? mmrVinSessionFromResult(session.vin, mmrRes.data)
          : session;
      lookupSessionRef.current = maxbuySession;

      const adj = initialMmrAdjustments(opportunity);
      const built = buildMmrLabMaxbuyRequest(
        maxbuySession,
        laneAskPriceRef.current,
        adj,
      );
      if ("error" in built) {
        setMaxbuyView({ kind: "error", message: built.error });
        return;
      }
      try {
        const maxbuyRes = await postMaxbuyEvaluate(built.body);
        if (cancelled || requestId !== lookupRequestIdRef.current) return;
        setPreferLiveMaxbuy(true);
        setMaxbuyView(applyMaxbuyResult(maxbuyRes, built.askingPrice));
      } catch {
        if (cancelled || requestId !== lookupRequestIdRef.current) return;
        setMaxbuyView(MAXBUY_FETCH_FAILED);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyMmrResult, autoRunMaxbuyOnMount, autoRunMmrOnMount, opportunity]);

  const handleAdjustmentsChange = useCallback(
    (next: MmrAdjustments) => {
      const newChanges = detectAttributeMarginalChanges(adjustments, next);
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

  const handleRunFresh = useCallback(() => {
    const session = sessionFromOpportunity(opportunity);
    if (!session) return;
    const runMaxbuy = shouldRunMaxbuyOnFreshLookup(opportunity);
    const requestId = ++lookupRequestIdRef.current;
    void runLookup(session, {
      runMaxbuy,
      refresh: true,
      requestId,
    });
  }, [opportunity, runLookup]);

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

  const resultBandPhase: ResultBandPhase =
    view.kind === "loading"
      ? "loading"
      : mmrRecomputing
        ? "recomputing"
        : view.kind === "ok"
          ? "ready"
          : view.kind === "unavailable"
            ? "unavailable"
            : "idle";

  const session = sessionFromOpportunity(opportunity);
  const canRunFresh = session !== null;
  const canRunMmr = identitySufficientForMmrAutoRun(opportunity) && session !== null;

  const showMmrSurface =
    view.kind !== "empty" && view.kind !== "error" && view.kind !== "loading";
  const showMmrLoading = view.kind === "loading";
  const maxbuyPlaceholder = maxbuyPlaceholderMessage(opportunity);
  const showMaxbuyCard =
    maxbuyView.kind !== "idle" ||
    (!preferLiveMaxbuy && savedVerdict !== null) ||
    maxbuyPlaceholder !== null;
  const insufficientMmr = !canRunMmr && !savedVerdict && view.kind === "empty";

  const mmrCardPhase: ResultBandPhase = showMmrLoading
    ? "loading"
    : resultBandPhase;

  return (
    <div className="space-y-3">
      {insufficientMmr ? <InsufficientIdentityNote kind="both" /> : null}

      {view.kind === "error" ? (
        <ErrorState error={view.error} onRetry={handleRunFresh} />
      ) : null}

      {!insufficientMmr && view.kind !== "error" && (showMmrSurface || showMmrLoading || showMaxbuyCard) ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {showMmrSurface || showMmrLoading ? (
            <MmrSummaryCard
              phase={mmrCardPhase}
              adjustments={adjustments}
              onAdjustmentsChange={handleAdjustmentsChange}
              onAdjustmentsClear={handleAdjustmentsClear}
              baseMmr={result?.mmrValue ?? null}
              unavailableReason={view.kind === "unavailable" ? view.reason : null}
              avgOdometer={result?.avgOdometer ?? null}
              avgCondition={result?.avgCondition ?? null}
              avgEvBatteryScore={result?.avgEvBatteryScore ?? null}
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
          ) : null}

          {showMaxbuyCard ? (
            <MaxbuySummaryCard
              savedSummary={preferLiveMaxbuy ? null : savedVerdict}
              liveState={maxbuyView}
              placeholderMessage={maxbuyPlaceholder}
            />
          ) : null}
        </div>
      ) : null}

      {!insufficientMmr && canRunFresh ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleRunFresh}>
            <RefreshCw className="size-3.5" aria-hidden /> Refresh valuation
          </Button>
        </div>
      ) : null}
    </div>
  );
}
