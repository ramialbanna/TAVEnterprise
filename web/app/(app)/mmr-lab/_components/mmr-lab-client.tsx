"use client";

import { useCallback, useState } from "react";

import { postMmrVin } from "@/lib/app-api/client";
import type { ApiResult } from "@/lib/app-api";
import type { MmrVinOk } from "@/lib/app-api/schemas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { LookupForm, type LookupSubmit } from "./lookup-form";
import { ResultPanel } from "./result-panel";

/**
 * Client wrapper for the MMR Lab.
 *
 * Owns the local interaction state:
 *   - `result`       — most recent `ApiResult<MmrVinOk>` from `postMmrVin` (or `null`).
 *   - `askingPrice`  — client-only field used by `ResultPanel` to compute spread &
 *                      recommendation; NEVER sent to the API.
 *   - `lookedUpAt`   — ISO timestamp captured at submit time (the lean MMR envelope
 *                      does not return one, so we record the client clock).
 *   - `pending`      — disables the submit button while a request is in flight.
 *
 * Retry is wired to re-run the same payload that produced the current result.
 */
export function MmrLabClient() {
  const [result, setResult] = useState<ApiResult<MmrVinOk> | null>(null);
  const [askingPrice, setAskingPrice] = useState<number | null>(null);
  const [lookedUpAt, setLookedUpAt] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lastSubmit, setLastSubmit] = useState<LookupSubmit | null>(null);

  const runLookup = useCallback(async (submit: LookupSubmit) => {
    setLastSubmit(submit);
    setAskingPrice(submit.askingPrice);
    setPending(true);
    setLookedUpAt(new Date().toISOString());
    const r = await postMmrVin(submit.api);
    setResult(r);
    setPending(false);
  }, []);

  const handleRetry = useCallback(() => {
    if (lastSubmit) void runLookup(lastSubmit);
  }, [lastSubmit, runLookup]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Lookup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LookupForm onLookup={(s) => void runLookup(s)} pending={pending} />
        </CardContent>
      </Card>

      <ResultPanel
        result={result}
        askingPrice={askingPrice}
        lookedUpAt={lookedUpAt}
        onRetry={lastSubmit ? handleRetry : undefined}
      />
    </div>
  );
}
