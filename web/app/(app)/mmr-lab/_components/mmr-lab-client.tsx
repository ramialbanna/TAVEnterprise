"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getMmrCatalogMakes,
  getMmrCatalogModels,
  getMmrCatalogStyles,
  getMmrCatalogYears,
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

export function MmrLabClient() {
  const [view, setView] = useState<View>({ kind: "empty" });
  const [identity, setIdentity] = useState<Identity>(null);
  const [selection, setSelection] = useState<MmrSelection>(emptySelection);
  const [catalog, setCatalog] = useState<MmrCatalogOptions>(emptyCatalog);

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

  const onVinSubmit = useCallback(async (vin: string) => {
    setIdentity({ kind: "vin", vin });
    setView({ kind: "loading" });
    const res = await postMmrVin({ vin });
    if (res.ok) {
      setView({ kind: "ok", result: res.data });
    } else if (res.kind === "unavailable") {
      setView({ kind: "unavailable", reason: res.error });
    } else {
      setView({ kind: "error", error: res });
    }
  }, []);

  const onYmmSubmit = useCallback(async () => {
    const mileage = parseMileage(selection.mileage);
    if (!selection.year || !selection.make || !selection.model || !selection.style || mileage === null) {
      return;
    }

    const title = titleFromSelection(selection);
    setIdentity({ kind: "vehicle", title });
    setView({ kind: "loading" });
    const res = await postMmrYmm({
      year: Number(selection.year),
      make: selection.make,
      model: selection.model,
      style: selection.style,
      mileage,
    });
    if (res.ok) {
      setView({ kind: "ok", result: res.data });
    } else if (res.kind === "unavailable") {
      setView({ kind: "unavailable", reason: res.error });
    } else {
      setView({ kind: "error", error: res });
    }
  }, [selection]);

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

  return (
    <div className="space-y-6">
      <SearchPanel
        onVinSubmit={(v) => void onVinSubmit(v)}
        vinPending={view.kind === "loading" && identity?.kind === "vin"}
        selection={selection}
        catalog={catalog}
        onSelectionChange={onSelectionChange}
        onYmmSubmit={() => void onYmmSubmit()}
        ymmPending={view.kind === "loading" && identity?.kind === "vehicle"}
      />

      {identity ? (
        <div className="border-b-4 border-primary px-6 pb-3 text-sm text-muted-foreground">
          {identity.kind === "vehicle" ? (
            <div className="text-xl font-semibold uppercase tracking-tight text-primary">
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
        <div className="px-6">
          <ErrorState
            error={view.error}
            onRetry={
              identity?.kind === "vin"
                ? () => void onVinSubmit(identity.vin)
                : identity?.kind === "vehicle"
                  ? () => void onYmmSubmit()
                  : undefined
            }
          />
        </div>
      ) : (
        <ResultBand
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

      <DataSections />
    </div>
  );
}
