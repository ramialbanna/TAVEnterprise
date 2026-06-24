"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

import {
  postMaxbuyEvaluate,
  postMmrVin,
  postMmrYmm,
} from "@/lib/app-api/client";
import type { ApiResult } from "@/lib/app-api";
import type {
  MaxbuySummary,
  MmrVinOk,
  OpportunityDetail,
} from "@/lib/app-api/schemas";
import { ErrorState, type ApiErrorResult } from "@/components/data-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, formatMoney } from "@/lib/format";

import {
  ResultBand,
  type ResultBandPhase,
} from "../../mmr-lab/_components/result-band";
import {
  MaxbuyEvaluationSection,
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

/** Identity sufficient for an auto-run per redesign §5 (VIN or YMM + mileage + asking + region). */
function identitySufficientForAutoRun(opportunity: OpportunityDetail): boolean {
  if (opportunity.vin?.trim()) return true;
  return (
    opportunity.year != null &&
    !!opportunity.make &&
    !!opportunity.model &&
    opportunity.mileage != null &&
    opportunity.price != null
  );
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

const VERDICT_LABELS: Record<NonNullable<MaxbuySummary["verdict"]>, string> = {
  STRONG_BUY: "Strong buy",
  BUY: "Buy",
  REVIEW: "Review",
  PASS: "Pass",
};

function SavedVerdictCard({
  summary,
  onRunFresh,
}: {
  summary: MaxbuySummary;
  onRunFresh: () => void;
}) {
  return (
    <Card className="border-border bg-muted/30">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Max buy (saved)
          </span>
          <Badge variant="outline">{VERDICT_LABELS[summary.verdict]}</Badge>
        </div>
        <dl className="grid gap-2 sm:grid-cols-2">
          <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
            <dt className="text-sm text-muted-foreground">Recommended</dt>
            <dd className="text-right text-sm font-medium tabular-nums">
              {formatMoney(summary.recommendedMaxBuy)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
            <dt className="text-sm text-muted-foreground">Data strength</dt>
            <dd className="text-right text-sm font-medium capitalize">
              {summary.dataStrength}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
            <dt className="text-sm text-muted-foreground">Evaluated</dt>
            <dd className="text-right text-sm font-medium tabular-nums">
              {formatDateTime(summary.evaluatedAt)}
            </dd>
          </div>
        </dl>
        <Button type="button" variant="outline" size="sm" onClick={onRunFresh}>
          <RefreshCw className="size-3.5" aria-hidden /> Run fresh lookup
        </Button>
      </CardContent>
    </Card>
  );
}

function InsufficientIdentityNote() {
  return (
    <Card className="border-dashed bg-surface-sunken">
      <CardContent className="flex items-start gap-2 py-6 text-sm text-muted-foreground">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Add a VIN or year/make/model + mileage to run MMR and Max buy on this
          deal.
        </span>
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
  const [view, setView] = useState<MmrView>({ kind: "empty" });
  const [maxbuyView, setMaxbuyView] = useState<MaxbuyEvaluationState>({
    kind: "idle",
  });
  const [adjustments, setAdjustments] = useState<MmrAdjustments>(() =>
    initialMmrAdjustments(opportunity),
  );
  const [mmrRecomputing, setMmrRecomputing] = useState(false);
  const hasAutoRunRef = useRef(false);

  const [adjustmentBaseline, setAdjustmentBaseline] =
    useState<MmrAdjustmentBaseline | null>(null);
  const [attributeMarginals, setAttributeMarginals] = useState<MmrAttributeMarginals>(
    EMPTY_MMR_ATTRIBUTE_MARGINALS,
  );

  const lookupSessionRef = useRef<MmrLabLookupSession | null>(null);
  const recomputeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMarginalChangesRef = useRef<(keyof MmrAttributeMarginals)[]>([]);
  const laneAskPriceRef = useRef<string>(laneAskPriceFromOpportunity(opportunity));
  const adjustmentsRef = useRef(adjustments);
  useLayoutEffect(() => {
    adjustmentsRef.current = adjustments;
  });

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
    async (session: MmrLabLookupSession) => {
      lookupSessionRef.current = session;
      setAdjustmentBaseline(null);
      setAdjustments(initialMmrAdjustments(opportunity));
      setAttributeMarginals(EMPTY_MMR_ATTRIBUTE_MARGINALS);
      pendingMarginalChangesRef.current = [];
      setView({ kind: "loading" });
      setMaxbuyView({ kind: "loading" });

      const mmrPromise =
        session.kind === "vin"
          ? postMmrVin({ vin: session.vin })
          : postMmrYmm({
              year: Number(session.selection.year),
              make: session.selection.make,
              model: session.selection.model,
              style: session.selection.style,
            });

      let mmrRes: ApiResult<MmrVinOk>;
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

      // Enrich VIN session with Cox YMM before Max buy when Cox omitted identity.
      const maxbuySession =
        session.kind === "vin"
          ? mmrVinSessionFromResult(session.vin, mmrRes.data)
          : session;
      lookupSessionRef.current = maxbuySession;

      const built = buildMmrLabMaxbuyRequest(
        maxbuySession,
        laneAskPriceRef.current,
      );
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
    },
    [applyMmrResult, opportunity],
  );

  // Auto-run on mount when no saved verdict and identity is sufficient (redesign §5).
  useEffect(() => {
    if (hasAutoRunRef.current) return;
    hasAutoRunRef.current = true;
    if (savedVerdict) return;
    if (!identitySufficientForAutoRun(opportunity)) return;
    const session = sessionFromOpportunity(opportunity);
    if (!session) return;
    const handle = setTimeout(() => {
      void runLookup(session);
    }, 0);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity.id]);

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
    if (session) void runLookup(session);
  }, [opportunity, runLookup]);

  const handleMaxbuyRetry = useCallback(() => {
    const session = lookupSessionRef.current ?? sessionFromOpportunity(opportunity);
    if (session) reEvaluateMaxbuy(session, laneAskPriceRef.current, adjustments);
  }, [adjustments, opportunity, reEvaluateMaxbuy]);

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

  return (
    <div className="space-y-3">
      {savedVerdict && view.kind === "empty" ? (
        <div className="space-y-3">
          <SavedVerdictCard summary={savedVerdict} onRunFresh={handleRunFresh} />
          {canRunFresh ? null : <InsufficientIdentityNote />}
        </div>
      ) : null}

      {!savedVerdict && view.kind === "empty" && !canRunFresh ? (
        <InsufficientIdentityNote />
      ) : null}

      {view.kind === "error" ? (
        <ErrorState error={view.error} onRetry={handleRunFresh} />
      ) : null}

      {view.kind !== "empty" && view.kind !== "error" ? (
        <>
          <div id="opportunity-mmr-result-band">
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
          </div>
          <MaxbuyEvaluationSection
            state={maxbuyView}
            onRetry={handleMaxbuyRetry}
          />
        </>
      ) : null}

      {view.kind === "empty" && savedVerdict && canRunFresh ? (
        // When a saved verdict is showing but user hasn't run fresh, still
        // surface the run-fresh affordance via the saved card (above).
        null
      ) : null}
    </div>
  );
}
