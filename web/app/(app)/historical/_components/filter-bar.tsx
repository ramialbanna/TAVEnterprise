"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { FilterState, VinPresence } from "./historical-filters";

/**
 * Controlled filter bar for `/historical`. Renders inputs for the documented filter
 * set; everything else (mileage, days-to-sell, region/store, source) is deferred
 * until the schema supports it.
 *
 * Make/Model: when the parent supplies a non-empty `makeOptions`/`modelOptions`,
 * render a native `<select>` so the operator picks from values the data already
 * contains. Falling back to a plain `<input>` keeps the bar usable when the first
 * fetch returns zero rows (initial empty state) or when the operator wants to type
 * a value that hasn't appeared yet.
 */
export function FilterBar({
  state,
  onChange,
  onClear,
  makeOptions,
  modelOptions,
}: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  onClear: () => void;
  makeOptions: string[];
  modelOptions: string[];
}) {
  function update<K extends keyof FilterState>(key: K, value: FilterState[K]): void {
    onChange({ ...state, [key]: value });
  }

  function parseIntOrNull(raw: string): number | null {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    if (!/^-?\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }

  return (
    <form
      role="search"
      aria-label="Historical sales filters"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="space-y-1.5">
        <Label htmlFor="hist-since">Since</Label>
        <Input
          id="hist-since"
          name="since"
          type="date"
          value={state.since ?? ""}
          onChange={(e) => update("since", e.target.value || null)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="hist-year">Year</Label>
        <Input
          id="hist-year"
          name="year"
          inputMode="numeric"
          value={state.year === null ? "" : String(state.year)}
          onChange={(e) => update("year", parseIntOrNull(e.target.value))}
          placeholder="2024"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="hist-make">Make</Label>
        {makeOptions.length > 0 ? (
          <select
            id="hist-make"
            name="make"
            value={state.make ?? ""}
            onChange={(e) => {
              const v = e.target.value || null;
              // Reset model when make changes (model options are make-scoped).
              onChange({ ...state, make: v, model: null });
            }}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All makes</option>
            {makeOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <Input
            id="hist-make"
            name="make"
            value={state.make ?? ""}
            onChange={(e) => update("make", e.target.value || null)}
            placeholder="Ford"
          />
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="hist-model">Model</Label>
        {modelOptions.length > 0 ? (
          <select
            id="hist-model"
            name="model"
            value={state.model ?? ""}
            onChange={(e) => update("model", e.target.value || null)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All models</option>
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <Input
            id="hist-model"
            name="model"
            value={state.model ?? ""}
            onChange={(e) => update("model", e.target.value || null)}
            placeholder="F-150"
          />
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="hist-trim">
          Trim{" "}
          <span className="text-xs font-normal text-muted-foreground">— client filter</span>
        </Label>
        <Input
          id="hist-trim"
          name="trim"
          value={state.trim ?? ""}
          onChange={(e) => update("trim", e.target.value || null)}
          placeholder="XLT"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="hist-vin">
          VIN{" "}
          <span className="text-xs font-normal text-muted-foreground">— client filter</span>
        </Label>
        <select
          id="hist-vin"
          name="vinPresent"
          value={state.vinPresent}
          onChange={(e) => update("vinPresent", e.target.value as VinPresence)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="any">Any</option>
          <option value="present">VIN present</option>
          <option value="missing">VIN missing</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="hist-gross-min">
          Gross min{" "}
          <span className="text-xs font-normal text-muted-foreground">— client</span>
        </Label>
        <Input
          id="hist-gross-min"
          name="grossMin"
          inputMode="numeric"
          value={state.grossMin === null ? "" : String(state.grossMin)}
          onChange={(e) => update("grossMin", parseIntOrNull(e.target.value))}
          placeholder="1000"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="hist-gross-max">
          Gross max{" "}
          <span className="text-xs font-normal text-muted-foreground">— client</span>
        </Label>
        <Input
          id="hist-gross-max"
          name="grossMax"
          inputMode="numeric"
          value={state.grossMax === null ? "" : String(state.grossMax)}
          onChange={(e) => update("grossMax", parseIntOrNull(e.target.value))}
          placeholder="5000"
        />
      </div>

      <div className="sm:col-span-2 lg:col-span-4">
        <Button type="button" variant="outline" onClick={onClear}>
          Clear filters
        </Button>
      </div>
    </form>
  );
}
