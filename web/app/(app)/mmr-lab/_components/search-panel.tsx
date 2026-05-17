"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  onVinSubmit: (vin: string) => void;
  vinPending: boolean;
};

const VIN_MIN = 11;
const VIN_MAX = 17;

const selectClass =
  "h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground " +
  "disabled:cursor-not-allowed disabled:opacity-50";

// Year/Make/Model/Style are intentionally rendered but DISABLED. There is no
// hardcoded vehicle catalog and no scraping. A live catalog requires official
// Manheim/Cox metadata access (tracked in #45); until then these are inert and
// VIN is the only valuation path. Do NOT wire local constants here.
const SELECTOR_LABELS = ["Year", "Make", "Model", "Style"] as const;

export function SearchPanel({ onVinSubmit, vinPending }: Props) {
  const [vin, setVin] = useState("");

  function submitVin() {
    const v = vin.trim();
    if (v.length >= VIN_MIN && v.length <= VIN_MAX) onVinSubmit(v);
  }

  return (
    <div>
      {/* Blue MMR bar */}
      <div className="bg-primary px-6 py-4">
        <span className="text-lg font-semibold tracking-tight text-primary-foreground">
          MMR
        </span>
      </div>

      {/* Gray search panel */}
      <div className="space-y-3 bg-surface-sunken px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
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
          >
            {vinPending ? "…" : "Search"}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SELECTOR_LABELS.map((label) => (
            <select
              key={label}
              aria-label={label}
              className={selectClass}
              value=""
              disabled
              title="Live catalog not connected"
            >
              <option value="">{label}</option>
            </select>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Live catalog not connected — Year/Make/Model/Style lookup needs official
          Manheim/Cox metadata access (tracked in #45). Use a VIN for a valuation.
        </p>
      </div>
    </div>
  );
}
