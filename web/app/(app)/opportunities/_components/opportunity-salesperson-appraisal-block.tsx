"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";

import type { OpportunityDetail } from "@/lib/app-api/schemas";
import type { PatchOpportunityRequest } from "@/lib/app-api/client";
import { listStaffDirectory } from "@/lib/app-api/client";
import { queryKeys } from "@/lib/query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useBlockAutoSave } from "./use-block-auto-save";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/**
 * Salesperson / Appraisal Information block. Directory dropdowns (item 53); auto-save on blur.
 */
export function OpportunitySalespersonAppraisalBlock({
  opportunity,
  onSave,
  pending,
  canMutate,
  error,
}: {
  opportunity: OpportunityDetail;
  onSave: (patch: PatchOpportunityRequest) => void;
  pending: boolean;
  canMutate: boolean;
  error?: string | null;
}) {
  const blockRef = useRef<HTMLDivElement>(null);

  const initial = useMemo(
    () => ({
      salesperson: opportunity.salesperson ?? "",
      appraiser: opportunity.appraiser ?? "",
    }),
    [opportunity],
  );

  const [values, setValues] = useState(initial);
  const [salespersonFilter, setSalespersonFilter] = useState("");
  const [appraiserFilter, setAppraiserFilter] = useState("");

  const salespeopleQuery = useQuery({
    queryKey: queryKeys.staffDirectory({ type: "salesperson" }),
    queryFn: () => listStaffDirectory({ type: "salesperson" }),
    staleTime: 60_000,
  });

  const appraisersQuery = useQuery({
    queryKey: queryKeys.staffDirectory({ type: "appraiser" }),
    queryFn: () => listStaffDirectory({ type: "appraiser" }),
    staleTime: 60_000,
  });

  const salespersonNames = useMemo(() => {
    const rows = salespeopleQuery.data?.ok ? salespeopleQuery.data.data : [];
    return rows.map((r) => r.displayName);
  }, [salespeopleQuery.data]);

  const appraiserNames = useMemo(() => {
    const rows = appraisersQuery.data?.ok ? appraisersQuery.data.data : [];
    return rows.map((r) => r.displayName);
  }, [appraisersQuery.data]);

  const isDirty = useMemo(() => {
    return (Object.keys(initial) as (keyof typeof initial)[]).some(
      (k) => values[k] !== initial[k],
    );
  }, [initial, values]);

  function buildPatch(): PatchOpportunityRequest {
    const patch: PatchOpportunityRequest = {};
    if (values.salesperson !== initial.salesperson)
      patch.salesperson = values.salesperson.trim() || null;
    if (values.appraiser !== initial.appraiser)
      patch.appraiser = values.appraiser.trim() || null;
    return patch;
  }

  function persistIfDirty() {
    const patch = buildPatch();
    if (Object.keys(patch).length > 0) onSave(patch);
  }

  const { handleBlur } = useBlockAutoSave({
    blockRef,
    isDirty,
    canSave: canMutate,
    pending,
    onSave: persistIfDirty,
  });

  function directoryField(opts: {
    key: "salesperson" | "appraiser";
    label: string;
    names: string[];
    filter: string;
    onFilterChange: (v: string) => void;
    loading: boolean;
  }) {
    const id = `appraisal-${opts.key}`;
    const filterId = `${id}-filter`;
    const current = values[opts.key];
    const filterLower = opts.filter.trim().toLowerCase();
    const filtered = filterLower
      ? opts.names.filter((n) => n.toLowerCase().includes(filterLower))
      : opts.names;
    const legacy =
      current && !opts.names.includes(current) ? current : null;

    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {opts.label}
        </Label>
        <Input
          id={filterId}
          value={opts.filter}
          onChange={(e) => opts.onFilterChange(e.target.value)}
          disabled={!canMutate || pending}
          placeholder="Filter list…"
          className="h-8 text-xs"
          aria-label={`Filter ${opts.label.toLowerCase()} list`}
        />
        <select
          id={id}
          className={selectClass}
          value={current}
          disabled={!canMutate || pending || opts.loading}
          onChange={(e) => setValues((v) => ({ ...v, [opts.key]: e.target.value }))}
        >
          <option value="">—</option>
          {legacy ? (
            <option value={legacy}>
              {legacy} (legacy)
            </option>
          ) : null}
          {filtered.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {opts.names.length === 0 && !opts.loading ? (
          <p className="text-xs text-muted-foreground">
            No {opts.label.toLowerCase()}s in the directory yet.
            {opts.key === "appraiser" ? " Ask an admin to add appraisers." : null}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div ref={blockRef} className="space-y-4" onBlur={handleBlur}>
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-status-error/30 bg-status-error-bg px-3 py-2 text-sm text-status-error">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {directoryField({
          key: "salesperson",
          label: "Salesperson",
          names: salespersonNames,
          filter: salespersonFilter,
          onFilterChange: setSalespersonFilter,
          loading: salespeopleQuery.isLoading,
        })}
        {directoryField({
          key: "appraiser",
          label: "Appraiser",
          names: appraiserNames,
          filter: appraiserFilter,
          onFilterChange: setAppraiserFilter,
          loading: appraisersQuery.isLoading,
        })}
      </div>
    </div>
  );
}
