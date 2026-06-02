"use client";

import { useState } from "react";

import type { MaxbuyEvaluateRequest, MaxbuyRegion } from "@/lib/app-api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const REGIONS: { value: MaxbuyRegion; label: string }[] = [
  { value: "dallas_tx", label: "Dallas TX" },
  { value: "houston_tx", label: "Houston TX" },
  { value: "austin_tx", label: "Austin TX" },
  { value: "san_antonio_tx", label: "San Antonio TX" },
  { value: "lubbock_tx", label: "Lubbock TX" },
  { value: "oklahoma_city_ok", label: "Oklahoma City OK" },
];

export type MaxbuyEvaluateFormValues = {
  vin: string;
  mileage: string;
  askingPrice: string;
  region: MaxbuyRegion | "";
};

export type MaxbuyEvaluateFormProps = {
  initial: MaxbuyEvaluateFormValues;
  vinReadOnly?: boolean;
  showRegion?: boolean;
  pending?: boolean;
  onSubmit: (body: MaxbuyEvaluateRequest, askingPrice: number | null) => void;
};

function parseOptionalInt(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}

export function buildMaxbuyEvaluateRequest(
  values: MaxbuyEvaluateFormValues,
  extras?: Pick<MaxbuyEvaluateRequest, "normalized_listing_id" | "lead_id">,
): { body: MaxbuyEvaluateRequest; askingPrice: number | null } | { error: string } {
  const vin = values.vin.trim().toUpperCase();
  if (!vin) return { error: "VIN is required" };

  const mileage = parseOptionalInt(values.mileage);
  const askingParsed = parseOptionalInt(values.askingPrice);
  const askingPrice = askingParsed ?? null;

  const body: MaxbuyEvaluateRequest = {
    contract_version: "1.0.0",
    vin,
    ...extras,
  };
  if (mileage !== undefined) body.mileage = mileage;
  if (askingParsed !== undefined) body.asking_price = askingParsed;
  if (values.region) body.region = values.region;

  return { body, askingPrice };
}

export function MaxbuyEvaluateForm({
  initial,
  vinReadOnly = false,
  showRegion = false,
  pending = false,
  onSubmit,
}: MaxbuyEvaluateFormProps) {
  const [values, setValues] = useState(initial);
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const built = buildMaxbuyEvaluateRequest(values);
        if ("error" in built) {
          setLocalError(built.error);
          return;
        }
        setLocalError(null);
        onSubmit(built.body, built.askingPrice);
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="maxbuy-vin">VIN</Label>
        <Input
          id="maxbuy-vin"
          name="vin"
          value={values.vin}
          readOnly={vinReadOnly}
          className={vinReadOnly ? "bg-muted" : undefined}
          onChange={(e) => setValues((v) => ({ ...v, vin: e.target.value.toUpperCase() }))}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="maxbuy-mileage">Mileage (optional)</Label>
          <Input
            id="maxbuy-mileage"
            name="mileage"
            inputMode="numeric"
            value={values.mileage}
            onChange={(e) => setValues((v) => ({ ...v, mileage: e.target.value }))}
            placeholder="Unknown OK"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxbuy-asking">Asking price (optional)</Label>
          <Input
            id="maxbuy-asking"
            name="askingPrice"
            inputMode="numeric"
            value={values.askingPrice}
            onChange={(e) => setValues((v) => ({ ...v, askingPrice: e.target.value }))}
            placeholder="For buy/pass verdict"
          />
        </div>
      </div>

      {showRegion ? (
        <div className="space-y-2">
          <Label htmlFor="maxbuy-region">Region (optional)</Label>
          <select
            id="maxbuy-region"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={values.region}
            onChange={(e) =>
              setValues((v) => ({ ...v, region: e.target.value as MaxbuyRegion | "" }))
            }
          >
            <option value="">—</option>
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {localError ? <p className="text-sm text-destructive">{localError}</p> : null}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Running…" : "Run max buy"}
      </Button>
    </form>
  );
}
