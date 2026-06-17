"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type MmrSelection = {
  year: string;
  make: string;
  model: string;
  style: string;
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
  vin: string;
  onVinChange: (value: string) => void;
  vinReadOnly?: boolean;
  onVinReset?: () => void;
  onVinSubmit: (vin: string) => void;
  vinPending: boolean;
  selection: MmrSelection;
  catalog: MmrCatalogOptions;
  onSelectionChange: (next: MmrSelection) => void;
  onYmmSubmit: () => void;
  ymmPending: boolean;
  laneAskPrice: string;
  onLaneAskPriceChange: (value: string) => void;
  /** Fields that were just cascade-cleared — briefly flashed to indicate the reset. */
  recentlyCleared?: Set<"make" | "model" | "style">;
};

const VIN_MIN = 11;
const VIN_MAX = 17;

const selectBase =
  "h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/** Parses optional lane/list price for MaxBuy `asking_price` (MLB-5). */
export function parseLaneAskPrice(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(/[^\d]/g, ""));
  if (!Number.isInteger(n) || n <= 0 || n > 10_000_000) return null;
  return n;
}

/** Split years into recent (current year − 4 … current year) and older. */
function partitionYears(years: string[]): { recent: string[]; older: string[] } {
  const currentYear = new Date().getFullYear();
  const cutoff = currentYear - 4;
  const recent = years.filter((y) => Number(y) >= cutoff).sort((a, b) => Number(b) - Number(a));
  const older = years.filter((y) => Number(y) < cutoff).sort((a, b) => Number(b) - Number(a));
  return { recent, older };
}

/** First required field that hasn't been filled in yet. */
function firstMissingYmmField(
  catalog: MmrCatalogOptions,
  selection: MmrSelection,
): string | null {
  if (catalog.catalogState !== "connected") return "catalog connection";
  if (!selection.year) return "Year";
  if (!selection.make) return "Make";
  if (!selection.model) return "Model";
  if (!selection.style) return "Style";
  return null;
}

type DisabledSelectProps = {
  "aria-label": string;
  value: string;
  isDisabled: boolean;
  isLoading: boolean;
  prerequisite: string;
  className?: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
};

/**
 * A `<select>` that stays focusable via keyboard even when disabled.
 * When the user presses Space/Enter while the control is disabled,
 * a brief tooltip message appears explaining what prerequisite is needed.
 */
function FocusableSelect({
  "aria-label": ariaLabel,
  value,
  isDisabled,
  isLoading,
  prerequisite,
  className,
  onChange,
  children,
}: DisabledSelectProps) {
  const [hint, setHint] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showHint() {
    if (!isDisabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setHint(`Select a ${prerequisite} first`);
    timerRef.current = setTimeout(() => setHint(null), 2000);
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div className="relative">
      <select
        aria-label={ariaLabel}
        value={value}
        disabled={isDisabled || isLoading}
        tabIndex={0}
        className={cn(selectBase, className)}
        onChange={(e) => {
          if (!isDisabled && !isLoading) onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && isDisabled) {
            e.preventDefault();
            showHint();
          }
        }}
      >
        {isLoading ? (
          <option value="" disabled>
            Loading…
          </option>
        ) : null}
        {children}
      </select>
      {hint ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute -top-8 left-0 z-20 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export function SearchPanel({
  vin,
  onVinChange,
  vinReadOnly = false,
  onVinReset,
  onVinSubmit,
  vinPending,
  selection,
  catalog,
  onSelectionChange,
  onYmmSubmit,
  ymmPending,
  laneAskPrice,
  onLaneAskPriceChange,
  recentlyCleared,
}: Props) {
  function submitVin() {
    if (vinReadOnly) return;
    const v = vin.trim();
    if (v.length >= VIN_MIN && v.length <= VIN_MAX) onVinSubmit(v);
  }

  const canSubmitYmm =
    catalog.catalogState === "connected" &&
    selection.year !== "" &&
    selection.make !== "" &&
    selection.model !== "" &&
    selection.style !== "" &&
    !ymmPending;

  const missingField = firstMissingYmmField(catalog, selection);
  const { recent: recentYears, older: olderYears } = partitionYears(catalog.years);

  /** Flash class applied to cascade-cleared dropdown wrappers. */
  function flashClass(field: "make" | "model" | "style") {
    return recentlyCleared?.has(field) ? "animate-flash rounded-md" : "";
  }

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
              readOnly={vinReadOnly}
              onChange={(e) => {
                if (!vinReadOnly) onVinChange(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitVin();
              }}
              className="pr-8"
            />
            {vin.length > 0 && !vinReadOnly && (
              <button
                type="button"
                aria-label="Clear VIN"
                onClick={() => onVinChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                ×
              </button>
            )}
          </div>
          <Button
            type="button"
            aria-label={vinReadOnly ? "Change VIN" : "Search VIN"}
            aria-busy={vinPending}
            disabled={vinPending}
            onClick={vinReadOnly ? onVinReset : submitVin}
            variant={vinReadOnly ? "outline" : "default"}
            className="w-full shrink-0 sm:w-auto"
          >
            {vinPending ? "…" : vinReadOnly ? "Change VIN" : "Search"}
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

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1.4fr_1.6fr_1.8fr_auto]">
          {/* Year */}
          <FocusableSelect
            aria-label="Year"
            value={selection.year}
            isDisabled={catalog.catalogState !== "connected"}
            isLoading={catalog.loading === "years"}
            prerequisite="catalog connection"
            onChange={(v) => onSelectionChange({ ...selection, year: v })}
          >
            <option value="">Year</option>
            {recentYears.length > 0 && olderYears.length > 0 ? (
              <>
                {recentYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
                <option disabled>──────────</option>
                {olderYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </>
            ) : (
              catalog.years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))
            )}
          </FocusableSelect>

          {/* Make */}
          <div className={flashClass("make")}>
            <FocusableSelect
              aria-label="Make"
              value={selection.make}
              isDisabled={
                catalog.catalogState !== "connected" || selection.year === ""
              }
              isLoading={catalog.loading === "makes"}
              prerequisite="Year"
              onChange={(v) => onSelectionChange({ ...selection, make: v })}
            >
              <option value="">Make</option>
              {catalog.makes.map((make) => (
                <option key={make} value={make}>{make}</option>
              ))}
            </FocusableSelect>
          </div>

          {/* Model */}
          <div className={flashClass("model")}>
            <FocusableSelect
              aria-label="Model"
              value={selection.model}
              isDisabled={
                catalog.catalogState !== "connected" || selection.make === ""
              }
              isLoading={catalog.loading === "models"}
              prerequisite="Make"
              onChange={(v) => onSelectionChange({ ...selection, model: v })}
            >
              <option value="">Model</option>
              {catalog.models.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </FocusableSelect>
          </div>

          {/* Style */}
          <div className={flashClass("style")}>
            <FocusableSelect
              aria-label="Style"
              value={selection.style}
              isDisabled={
                catalog.catalogState !== "connected" || selection.model === ""
              }
              isLoading={catalog.loading === "styles"}
              prerequisite="Model"
              onChange={(v) => onSelectionChange({ ...selection, style: v })}
            >
              <option value="">Style</option>
              {catalog.styles.map((style) => (
                <option key={style} value={style}>{style}</option>
              ))}
            </FocusableSelect>
          </div>

          {/* Value button with tooltip for missing fields */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* span wrapper needed because Radix tooltip won't fire on a disabled button */}
                <span
                  className="w-full sm:col-span-2 lg:col-span-1 lg:w-auto"
                  tabIndex={canSubmitYmm ? -1 : 0}
                >
                  <Button
                    type="button"
                    aria-label="Value selected vehicle"
                    disabled={!canSubmitYmm}
                    aria-busy={ymmPending}
                    onClick={onYmmSubmit}
                    className="w-full"
                  >
                    {ymmPending ? "…" : "Value"}
                  </Button>
                </span>
              </TooltipTrigger>
              {!canSubmitYmm && missingField ? (
                <TooltipContent side="top">
                  Select a {missingField} to enable valuation
                </TooltipContent>
              ) : null}
            </Tooltip>
          </TooltipProvider>
        </div>

        <p className="text-xs text-muted-foreground">
          {catalog.catalogState === "connected"
            ? "Live Manheim/Cox catalog connected. Y/M/M/S valuation requires a style selection."
            : `Live catalog not connected${
                catalog.reason ? ` — ${catalog.reason}` : ""
              }. Use VIN while metadata is unavailable.`}
        </p>
      </div>
    </div>
  );
}
