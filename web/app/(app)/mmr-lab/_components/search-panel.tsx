"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type MmrSelection = {
  year: string;
  make: string;
  model: string;
  style: string;
  mileage: string;
};

export type MmrCatalogOptions = {
  years: string[];
  makes: string[];
  models: string[];
  styles: string[];
  catalogState: "connected" | "not_connected";
  reason: string | null;
  loading: "years" | "makes" | "models" | "styles" | null;
};

type Props = {
  onVinSubmit: (vin: string) => void;
  vinPending: boolean;
  selection: MmrSelection;
  catalog: MmrCatalogOptions;
  onSelectionChange: (next: MmrSelection) => void;
  onYmmSubmit: () => void;
  ymmPending: boolean;
  laneAskPrice: string;
  onLaneAskPriceChange: (value: string) => void;
};

const VIN_MIN = 11;
const VIN_MAX = 17;

const selectClass =
  "h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const emptySelection: MmrSelection = {
  year: "",
  make: "",
  model: "",
  style: "",
  mileage: "",
};

function numericMileage(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 2_000_000 ? n : null;
}

/** Parses optional lane/list price for MaxBuy `asking_price` (MLB-5). */
export function parseLaneAskPrice(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(/[^\d]/g, ""));
  if (!Number.isInteger(n) || n <= 0 || n > 10_000_000) return null;
  return n;
}

export function SearchPanel({
  onVinSubmit,
  vinPending,
  selection,
  catalog,
  onSelectionChange,
  onYmmSubmit,
  ymmPending,
  laneAskPrice,
  onLaneAskPriceChange,
}: Props) {
  const [vin, setVin] = useState("");

  function submitVin() {
    const v = vin.trim();
    if (v.length >= VIN_MIN && v.length <= VIN_MAX) onVinSubmit(v);
  }

  const mileage = numericMileage(selection.mileage);
  const canSubmitYmm =
    catalog.catalogState === "connected" &&
    selection.year !== "" &&
    selection.make !== "" &&
    selection.model !== "" &&
    selection.style !== "" &&
    mileage !== null &&
    !ymmPending;

  return (
    <div>
      <div className="bg-primary px-4 py-4 sm:px-6">
        <span className="text-lg font-semibold tracking-tight text-primary-foreground">
          MMR
        </span>
      </div>

      <div className="space-y-3 bg-surface-sunken px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Input
              placeholder="Enter VIN"
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitVin();
              }}
              className="pr-8"
            />
            {vin.length > 0 && (
              <button
                type="button"
                aria-label="Clear VIN"
                onClick={() => setVin("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                ×
              </button>
            )}
          </div>
          <Button
            type="button"
            aria-label="Search VIN"
            aria-busy={vinPending}
            disabled={vinPending}
            onClick={submitVin}
            className="w-full shrink-0 sm:w-auto"
          >
            {vinPending ? "…" : "Search"}
          </Button>
        </div>

        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          <Input
            aria-label="Lane ask price"
            inputMode="numeric"
            placeholder="Lane ask (optional)"
            value={laneAskPrice}
            onChange={(e) => onLaneAskPriceChange(e.target.value.replace(/[^\d]/g, ""))}
            className="sm:max-w-xs"
          />
          <p className="text-xs text-muted-foreground">
            Your offer or list price at the lane — forwarded to Max buy as asking price for buy/pass
            verdict (not wholesale MMR).
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1.4fr_1.6fr_1.8fr_1fr_auto]">
          <select
            aria-label="Year"
            className={selectClass}
            value={selection.year}
            disabled={catalog.catalogState !== "connected" || catalog.loading === "years"}
            onChange={(e) =>
              onSelectionChange({
                ...emptySelection,
                year: e.target.value,
              })
            }
          >
            <option value="">Year</option>
            {catalog.years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>

          <select
            aria-label="Make"
            className={selectClass}
            value={selection.make}
            disabled={
              catalog.catalogState !== "connected" ||
              selection.year === "" ||
              catalog.loading === "makes"
            }
            onChange={(e) =>
              onSelectionChange({
                ...selection,
                make: e.target.value,
                model: "",
                style: "",
              })
            }
          >
            <option value="">Make</option>
            {catalog.makes.map((make) => (
              <option key={make} value={make}>
                {make}
              </option>
            ))}
          </select>

          <select
            aria-label="Model"
            className={selectClass}
            value={selection.model}
            disabled={
              catalog.catalogState !== "connected" ||
              selection.make === "" ||
              catalog.loading === "models"
            }
            onChange={(e) =>
              onSelectionChange({
                ...selection,
                model: e.target.value,
                style: "",
              })
            }
          >
            <option value="">Model</option>
            {catalog.models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>

          <select
            aria-label="Style"
            className={selectClass}
            value={selection.style}
            disabled={
              catalog.catalogState !== "connected" ||
              selection.model === "" ||
              catalog.loading === "styles"
            }
            onChange={(e) =>
              onSelectionChange({
                ...selection,
                style: e.target.value,
              })
            }
          >
            <option value="">Style</option>
            {catalog.styles.map((style) => (
              <option key={style} value={style}>
                {style}
              </option>
            ))}
          </select>

          <Input
            aria-label="Mileage"
            inputMode="numeric"
            placeholder="Miles"
            value={selection.mileage}
            onChange={(e) =>
              onSelectionChange({
                ...selection,
                mileage: e.target.value.replace(/[^\d]/g, ""),
              })
            }
          />

          <Button
            type="button"
            aria-label="Value selected vehicle"
            disabled={!canSubmitYmm}
            aria-busy={ymmPending}
            onClick={onYmmSubmit}
            className="w-full sm:col-span-2 lg:col-span-1 lg:w-auto"
          >
            {ymmPending ? "…" : "Value"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {catalog.catalogState === "connected"
            ? "Live Manheim/Cox catalog connected. Y/M/M/S valuation requires style and miles."
            : `Live catalog not connected${
                catalog.reason ? ` — ${catalog.reason}` : ""
              }. Use VIN while metadata is unavailable.`}
        </p>
      </div>
    </div>
  );
}
