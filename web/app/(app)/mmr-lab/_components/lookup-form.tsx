"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * MMR Lab lookup form.
 *
 * Validation:
 *   - VIN required. Client-side trimmed + upper-cased. A-Z0-9 only. Length 11–17.
 *   - Mileage optional integer in [0, 2_000_000].
 *   - Year    optional integer in [1900, 2100].
 *
 * The form also carries an asking price + source + notes — these are CLIENT-ONLY fields
 * (asking price is used by the local recommendation; source/notes are scratchpad for the
 * operator). They never reach `/app/mmr/vin`. The `onLookup` callback receives only the
 * fields the API knows about: `{ vin, year, mileage }` plus the asking price as a separate
 * argument so the result panel can compute the spread.
 *
 * "Fill example" loads the validated Cox sandbox VIN documented in `docs/APP_API.md`.
 */

export type LookupApiPayload = {
  vin: string;
  year?: number;
  mileage?: number;
};

export type LookupSubmit = {
  api: LookupApiPayload;
  /** Client-only — passed alongside the API payload so the result panel can compute spread. */
  askingPrice: number | null;
  /** Client-only YMM — never sent to `/app/mmr/vin`. Drives the historical comparison panel. */
  make: string | null;
  model: string | null;
  /** Client-only trim — filtered client-side by the comparison panel; never an API param. */
  trim: string | null;
};

export const EXAMPLE_VIN = "1FT8W3BT1SEC27066";
export const EXAMPLE_MILEAGE = 50000;
export const EXAMPLE_YEAR = 2025;
export const EXAMPLE_MAKE = "Ford";
export const EXAMPLE_MODEL = "F-350SD";
export const EXAMPLE_TRIM = "";

const VIN_RE = /^[A-Z0-9]{11,17}$/;

export function LookupForm({
  onLookup,
  pending = false,
}: {
  onLookup: (s: LookupSubmit) => void;
  pending?: boolean;
}) {
  const [vin, setVin] = useState("");
  const [mileage, setMileage] = useState("");
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleanedVin = vin.trim().toUpperCase();
    if (!VIN_RE.test(cleanedVin)) {
      setError("VIN must be 11–17 characters, A–Z and 0–9 only.");
      return;
    }
    const mileageNum = parseOptionalInt(mileage, 0, 2_000_000, "Mileage must be 0–2,000,000.");
    if (mileageNum instanceof Error) {
      setError(mileageNum.message);
      return;
    }
    const yearNum = parseOptionalInt(year, 1900, 2100, "Year must be 1900–2100.");
    if (yearNum instanceof Error) {
      setError(yearNum.message);
      return;
    }
    const askingNum = parseOptionalInt(askingPrice, 0, 10_000_000, "Asking price out of range.");
    if (askingNum instanceof Error) {
      setError(askingNum.message);
      return;
    }
    setError(null);

    const api: LookupApiPayload = { vin: cleanedVin };
    if (yearNum !== null) api.year = yearNum;
    if (mileageNum !== null) api.mileage = mileageNum;

    onLookup({
      api,
      askingPrice: askingNum,
      make: nonBlank(make),
      model: nonBlank(model),
      trim: nonBlank(trim),
    });
  }

  function fillExample() {
    setVin(EXAMPLE_VIN);
    setMileage(String(EXAMPLE_MILEAGE));
    setYear(String(EXAMPLE_YEAR));
    setMake(EXAMPLE_MAKE);
    setModel(EXAMPLE_MODEL);
    setTrim(EXAMPLE_TRIM);
    setError(null);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" aria-label="MMR lookup form" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="mmr-vin">
          VIN <span aria-hidden className="text-status-error">*</span>
        </Label>
        <Input
          id="mmr-vin"
          name="vin"
          value={vin}
          onChange={(e) => setVin(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="17-char VIN"
          required
          aria-required="true"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mmr-mileage">Mileage</Label>
          <Input
            id="mmr-mileage"
            name="mileage"
            inputMode="numeric"
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            placeholder="50000"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mmr-year">Year</Label>
          <Input
            id="mmr-year"
            name="year"
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2025"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="mmr-make">
            Make{" "}
            <span className="text-xs font-normal text-muted-foreground">— local only</span>
          </Label>
          <Input
            id="mmr-make"
            name="make"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            placeholder="Ford"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mmr-model">
            Model{" "}
            <span className="text-xs font-normal text-muted-foreground">— local only</span>
          </Label>
          <Input
            id="mmr-model"
            name="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="F-150"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mmr-trim">
            Trim{" "}
            <span className="text-xs font-normal text-muted-foreground">— local only</span>
          </Label>
          <Input
            id="mmr-trim"
            name="trim"
            value={trim}
            onChange={(e) => setTrim(e.target.value)}
            placeholder="XLT"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mmr-asking">
          Asking price{" "}
          <span className="text-xs font-normal text-muted-foreground">
            — local only, never sent to the API
          </span>
        </Label>
        <Input
          id="mmr-asking"
          name="askingPrice"
          inputMode="numeric"
          value={askingPrice}
          onChange={(e) => setAskingPrice(e.target.value)}
          placeholder="62000"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mmr-source">
            Source{" "}
            <span className="text-xs font-normal text-muted-foreground">— local only</span>
          </Label>
          <Input
            id="mmr-source"
            name="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="facebook / dealer / craigslist…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mmr-notes">
            Notes{" "}
            <span className="text-xs font-normal text-muted-foreground">— local only</span>
          </Label>
          <Input
            id="mmr-notes"
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="anything you want to remember"
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-status-error">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Looking up…" : "Look up MMR"}
        </Button>
        <Button type="button" variant="outline" onClick={fillExample}>
          Fill example (sandbox VIN)
        </Button>
        <span className="text-xs text-muted-foreground">
          Example loads the Cox sandbox VIN <code>{EXAMPLE_VIN}</code> for testing only.
        </span>
      </div>
    </form>
  );
}

/** Trim a string; treat all-whitespace / empty input as `null` so downstream filters omit it. */
function nonBlank(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Parse an optional integer string. Empty/whitespace → `null` (field omitted). Anything
 * non-numeric or out of `[min, max]` → an `Error` (handled by the caller).
 */
function parseOptionalInt(raw: string, min: number, max: number, msg: string): number | null | Error {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (!/^-?\d+$/.test(trimmed)) return new Error(msg);
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < min || n > max) return new Error(msg);
  return n;
}
