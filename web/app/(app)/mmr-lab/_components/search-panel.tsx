"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMakes, getModels, getStyles, getYears } from "../_data/interim-catalog";

export type VehicleIdentity = {
  year?: number;
  make?: string;
  model?: string;
  style?: string;
};

type Props = {
  onVinSubmit: (vin: string) => void;
  onIdentityChange: (identity: VehicleIdentity) => void;
  vinPending: boolean;
};

const VIN_MIN = 11;
const VIN_MAX = 17;

const selectClass =
  "h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function SearchPanel({ onVinSubmit, onIdentityChange, vinPending }: Props) {
  const [vin, setVin] = useState("");
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [style, setStyle] = useState("");

  function emit(next: { year: string; make: string; model: string; style: string }) {
    const id: VehicleIdentity = {};
    if (next.year) id.year = Number(next.year);
    if (next.make) id.make = next.make;
    if (next.model) id.model = next.model;
    if (next.style) id.style = next.style;
    onIdentityChange(id);
  }

  function changeYear(v: string) {
    setYear(v);
    setMake("");
    setModel("");
    setStyle("");
    emit({ year: v, make: "", model: "", style: "" });
  }
  function changeMake(v: string) {
    setMake(v);
    setModel("");
    setStyle("");
    emit({ year, make: v, model: "", style: "" });
  }
  function changeModel(v: string) {
    setModel(v);
    setStyle("");
    emit({ year, make, model: v, style: "" });
  }
  function changeStyle(v: string) {
    setStyle(v);
    emit({ year, make, model, style: v });
  }

  function submitVin() {
    const v = vin.trim();
    if (v.length >= VIN_MIN && v.length <= VIN_MAX) onVinSubmit(v);
  }

  const yearNum = year ? Number(year) : null;

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
            disabled={vinPending}
            onClick={submitVin}
          >
            {vinPending ? "…" : "Search"}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select
            aria-label="Year"
            className={selectClass}
            value={year}
            onChange={(e) => changeYear(e.target.value)}
          >
            <option value="">Year</option>
            {getYears().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <select
            aria-label="Make"
            className={selectClass}
            value={make}
            disabled={!year}
            onChange={(e) => changeMake(e.target.value)}
          >
            <option value="">Make</option>
            {yearNum != null &&
              getMakes(yearNum).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
          </select>

          <select
            aria-label="Model"
            className={selectClass}
            value={model}
            disabled={!make}
            onChange={(e) => changeModel(e.target.value)}
          >
            <option value="">Model</option>
            {yearNum != null &&
              make &&
              getModels(yearNum, make).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
          </select>

          <select
            aria-label="Style"
            className={selectClass}
            value={style}
            disabled={!model}
            onChange={(e) => changeStyle(e.target.value)}
          >
            <option value="">Style</option>
            {yearNum != null &&
              make &&
              model &&
              getStyles(yearNum, make, model).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
          </select>
        </div>
      </div>
    </div>
  );
}
