"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  listAppUsers,
  parseListingUrl,
  submitManualOpportunity,
  type ManualSubmissionRequest,
} from "@/lib/app-api/client";
import type { ParsedListingFields } from "@/lib/app-api/schemas";
import { queryKeys } from "@/lib/query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  applyVehicleCascadeChange,
  partitionYears,
  resolveParsedVehicleFields,
  useVehicleCatalogOptions,
  type VehicleSelection,
} from "./use-vehicle-catalog";

const REGIONS = [
  { value: "dallas_tx", label: "Dallas TX" },
  { value: "houston_tx", label: "Houston TX" },
  { value: "austin_tx", label: "Austin TX" },
  { value: "san_antonio_tx", label: "San Antonio TX" },
  { value: "lubbock_tx", label: "Lubbock TX" },
  { value: "oklahoma_city_ok", label: "Oklahoma City OK" },
] as const;

const SOURCES = [
  { value: "", label: "Auto-detect from URL" },
  { value: "facebook", label: "Facebook Marketplace" },
  { value: "craigslist", label: "Craigslist" },
  { value: "autotrader", label: "Autotrader" },
  { value: "cars_com", label: "Cars.com" },
  { value: "offerup", label: "OfferUp" },
] as const;

type FormState = {
  listingUrl: string;
  assignedToUserId: string;
  source: string;
  region: string;
  year: string;
  make: string;
  model: string;
  style: string;
  price: string;
  mileage: string;
  sellerNotes: string;
  submitterNotes: string;
};

const EMPTY_FORM: FormState = {
  listingUrl: "",
  assignedToUserId: "",
  source: "",
  region: "",
  year: "",
  make: "",
  model: "",
  style: "",
  price: "",
  mileage: "",
  sellerNotes: "",
  submitterNotes: "",
};

function isRequiredFieldMissing(form: FormState): string | null {
  if (!form.listingUrl.trim()) return "Listing URL is required";
  if (!form.region) return "Region is required";
  if (!form.year.trim()) return "Year is required";
  if (!form.make.trim()) return "Make is required";
  if (!form.model.trim()) return "Model is required";
  if (!form.price.trim()) return "Price is required";
  return null;
}

function buildRequest(form: FormState): ManualSubmissionRequest | null {
  const missing = isRequiredFieldMissing(form);
  if (missing) return null;

  const year = parseOptionalInt(form.year);
  const price = parseOptionalInt(form.price);
  if (year === undefined || price === undefined) return null;

  const body: ManualSubmissionRequest = {
    listingUrl: form.listingUrl.trim(),
    region: form.region as ManualSubmissionRequest["region"],
    year,
    make: form.make.trim(),
    model: form.model.trim(),
    price,
  };

  if (form.assignedToUserId) body.assignedToUserId = form.assignedToUserId;
  if (form.source) body.source = form.source as ManualSubmissionRequest["source"];
  if (form.style.trim()) body.style = form.style.trim();

  const mileage = parseOptionalInt(form.mileage);
  if (mileage !== undefined) body.mileage = mileage;

  if (form.sellerNotes.trim()) body.sellerNotes = form.sellerNotes.trim();
  if (form.submitterNotes.trim()) body.submitterNotes = form.submitterNotes.trim();

  return body;
}

const selectClass =
  "h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground " +
  "disabled:cursor-not-allowed disabled:opacity-50";

function parseOptionalInt(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) ? n : undefined;
}

function isFormComplete(form: FormState): boolean {
  return isRequiredFieldMissing(form) === null && parseOptionalInt(form.year) !== undefined && parseOptionalInt(form.price) !== undefined;
}

function applyParsedFields(prev: FormState, parsed: ParsedListingFields): FormState {
  const next: FormState = {
    ...prev,
    listingUrl: parsed.listingUrl,
    source: parsed.source,
  };
  // Y/M/M/S are resolved against the catalog in `useManualSubmitForm`'s parse
  // handler (see `resolveParsedVehicleFields`) before this is called for the
  // dropdown path. When the catalog isn't connected (manual entry fallback),
  // we fall back to writing the parsed strings directly so the free-text
  // inputs still populate.
  if (parsed.year !== undefined) next.year = String(parsed.year);
  if (parsed.make) next.make = parsed.make;
  if (parsed.model) next.model = parsed.model;
  if (parsed.style) next.style = parsed.style;
  if (parsed.price !== undefined) next.price = String(parsed.price);
  if (parsed.mileage !== undefined) next.mileage = String(parsed.mileage);
  return next;
}

export function useManualSubmitForm(options: { loadUsers: boolean; onSuccessClose?: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Free-text fallback for Y/M/M/S when the catalog isn't connected or the
  // user explicitly opts out of dropdowns (e.g. vehicle not in catalog).
  const [manualVehicleEntry, setManualVehicleEntry] = useState(false);

  const vehicleSelection: VehicleSelection = {
    year: form.year,
    make: form.make,
    model: form.model,
    style: form.style,
  };
  const catalog = useVehicleCatalogOptions(vehicleSelection);
  const useDropdowns = !manualVehicleEntry && catalog.catalogState !== "not_connected";

  const usersQuery = useQuery({
    queryKey: queryKeys.appUsers,
    queryFn: listAppUsers,
    enabled: options.loadUsers,
  });

  const parseMutation = useMutation({
    mutationFn: parseListingUrl,
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const parsed = result.data;
      // When dropdowns are active, resolve Y/M/M/S against the catalog so the
      // parsed values land on valid options (case-insensitive match). Fields
      // that don't match are left empty for the user to pick from the dropdown.
      if (useDropdowns) {
        const resolved = await resolveParsedVehicleFields({
          year: parsed.year !== undefined ? String(parsed.year) : undefined,
          make: parsed.make,
          model: parsed.model,
          style: parsed.style,
        });
        setForm((prev) => ({
          ...prev,
          listingUrl: parsed.listingUrl,
          source: parsed.source,
          year: resolved.year,
          make: resolved.make,
          model: resolved.model,
          style: resolved.style,
          price: parsed.price !== undefined ? String(parsed.price) : prev.price,
          mileage: parsed.mileage !== undefined ? String(parsed.mileage) : prev.mileage,
        }));
        const unmatched: string[] = [];
        if (parsed.year !== undefined && !resolved.year) unmatched.push("year");
        if (parsed.make && !resolved.make) unmatched.push("make");
        if (parsed.model && !resolved.model) unmatched.push("model");
        if (parsed.style && !resolved.style) unmatched.push("style");
        if (unmatched.length > 0) {
          toast.message("Listing parsed — some fields need a dropdown pick", {
            description: `Couldn't auto-match: ${unmatched.join(", ")}`,
          });
        }
      } else {
        setForm((prev) => applyParsedFields(prev, parsed));
      }
      setDetailsOpen(true);
      if (parsed.warnings.length > 0) {
        toast.message("Listing parsed with notes", {
          description: parsed.warnings.join(" · "),
        });
      } else if (!useDropdowns || parsed.year === undefined || parsed.make === undefined) {
        toast.success("Listing parsed — confirm region and submit");
      }
    },
  });

  const mutation = useMutation({
    mutationFn: submitManualOpportunity,
    onSuccess: (result) => {
      if (!result.ok) {
        if (
          result.error === "duplicate_listing_url" &&
          typeof result.details?.normalizedListingId === "string"
        ) {
          const listingId = result.details.normalizedListingId;
          toast.error(result.message, {
            action: {
              label: "View deal",
              onClick: () => router.push(`/opportunities/${listingId}`),
            },
          });
          return;
        }
        toast.error(result.message);
        return;
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.opportunities() });
      void queryClient.invalidateQueries({ queryKey: ["opportunities-page"] });

      toast.success("Listing submitted");

      setForm(EMPTY_FORM);
      setDetailsOpen(false);
      options.onSuccessClose?.();

      if (result.data.opportunity?.id) {
        router.push(`/opportunities/${result.data.opportunity.id}`);
      }
    },
  });

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      if (useDropdowns && (key === "year" || key === "make" || key === "model" || key === "style")) {
        const prevVehicle: VehicleSelection = {
          year: prev.year,
          make: prev.make,
          model: prev.model,
          style: prev.style,
        };
        const nextVehicle = applyVehicleCascadeChange(prevVehicle, {
          ...prevVehicle,
          [key]: value,
        });
        return { ...prev, ...nextVehicle };
      }
      return { ...prev, [key]: value };
    });
  }

  function handleParse() {
    const url = form.listingUrl.trim();
    if (!url) {
      toast.error("Paste a listing URL first");
      return;
    }
    parseMutation.mutate(url);
  }

  function openDetailsManually() {
    setDetailsOpen(true);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const missing = isRequiredFieldMissing(form);
    if (missing) {
      toast.error(missing);
      return;
    }
    const body = buildRequest(form);
    if (!body) {
      toast.error("Check year and price — whole numbers only");
      return;
    }
    mutation.mutate(body);
  }

  const users = usersQuery.data?.ok ? usersQuery.data.data : [];
  const canSubmit = detailsOpen && isFormComplete(form) && !mutation.isPending;
  const mileageUnknown = !form.mileage.trim();

  return {
    form,
    updateField,
    handleSubmit,
    handleParse,
    openDetailsManually,
    detailsOpen,
    mileageUnknown,
    usersQuery,
    users,
    canSubmit,
    mutation,
    parseMutation,
    catalog,
    useDropdowns,
    manualVehicleEntry,
    setManualVehicleEntry,
  };
}

export function ManualSubmitFormFields({
  idPrefix = "",
  form,
  updateField,
  handleSubmit,
  handleParse,
  openDetailsManually,
  detailsOpen,
  mileageUnknown,
  usersQuery,
  users,
  parseMutation,
  catalog,
  useDropdowns,
  setManualVehicleEntry,
  footer,
}: Omit<ReturnType<typeof useManualSubmitForm>, "canSubmit" | "mutation"> & {
  idPrefix?: string;
  footer: ReactNode;
}) {
  const pid = (name: string) => (idPrefix ? `${idPrefix}-${name}` : name);
  const parsing = parseMutation.isPending;
  const { recent: recentYears, older: olderYears } = partitionYears(catalog.years);
  const catalogDown = catalog.catalogState === "not_connected";

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor={pid("listingUrl")}>Listing URL</Label>
        <Input
          id={pid("listingUrl")}
          name="listingUrl"
          type="url"
          required
          placeholder="https://www.facebook.com/marketplace/item/..."
          value={form.listingUrl}
          onChange={(e) => updateField("listingUrl", e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={parsing || !form.listingUrl.trim()}
            onClick={handleParse}
          >
            {parsing ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Parsing…
              </>
            ) : (
              "Parse listing"
            )}
          </Button>
          {!detailsOpen ? (
            <Button type="button" variant="ghost" className="text-muted-foreground" onClick={openDetailsManually}>
              Enter vehicle details manually
            </Button>
          ) : null}
        </div>
      </div>

      {!detailsOpen ? (
        <p className="text-sm text-muted-foreground">
          Paste a Facebook Marketplace link and parse, or enter vehicle details manually before submitting.
        </p>
      ) : null}

      {detailsOpen ? (
        <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={pid("region")}>Region</Label>
          <select
            id={pid("region")}
            className={selectClass}
            required
            value={form.region}
            onChange={(e) => updateField("region", e.target.value)}
          >
            <option value="" disabled>
              Select region
            </option>
            {REGIONS.map((region) => (
              <option key={region.value} value={region.value}>
                {region.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={pid("source")}>Source</Label>
          <select
            id={pid("source")}
            className={selectClass}
            value={form.source}
            onChange={(e) => updateField("source", e.target.value)}
          >
            {SOURCES.map((source) => (
              <option key={source.label} value={source.value}>
                {source.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {useDropdowns ? (
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor={pid("year")}>Year</Label>
              <select
                id={pid("year")}
                className={selectClass}
                required
                value={form.year}
                onChange={(e) => updateField("year", e.target.value)}
                disabled={catalog.loading === "years"}
              >
                <option value="" disabled>
                  {catalog.loading === "years" ? "Loading…" : "Select year"}
                </option>
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
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={pid("make")}>Make</Label>
              <select
                id={pid("make")}
                className={selectClass}
                required
                value={form.make}
                onChange={(e) => updateField("make", e.target.value)}
                disabled={!form.year || catalog.loading === "makes"}
              >
                <option value="" disabled>
                  {!form.year ? "Select year first" : catalog.loading === "makes" ? "Loading…" : "Select make"}
                </option>
                {catalog.makes.map((make) => (
                  <option key={make} value={make}>{make}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={pid("model")}>Model</Label>
              <select
                id={pid("model")}
                className={selectClass}
                required
                value={form.model}
                onChange={(e) => updateField("model", e.target.value)}
                disabled={!form.make || catalog.loading === "models"}
              >
                <option value="" disabled>
                  {!form.make ? "Select make first" : catalog.loading === "models" ? "Loading…" : "Select model"}
                </option>
                {catalog.models.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={pid("style")}>Style / trim</Label>
              <select
                id={pid("style")}
                className={selectClass}
                value={form.style}
                onChange={(e) => updateField("style", e.target.value)}
                disabled={!form.model || catalog.loading === "styles"}
              >
                <option value="">
                  {!form.model ? "Select model first" : catalog.loading === "styles" ? "Loading…" : "Any style"}
                </option>
                {catalog.styles.map((style) => (
                  <option key={style} value={style}>{style}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setManualVehicleEntry(true)}
          >
            Vehicle not in catalog? Type manually
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor={pid("year")}>Year</Label>
              <Input
                id={pid("year")}
                inputMode="numeric"
                required
                placeholder="2020"
                value={form.year}
                onChange={(e) => updateField("year", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={pid("make")}>Make</Label>
              <Input
                id={pid("make")}
                required
                placeholder="toyota"
                value={form.make}
                onChange={(e) => updateField("make", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={pid("model")}>Model</Label>
              <Input
                id={pid("model")}
                required
                placeholder="camry"
                value={form.model}
                onChange={(e) => updateField("model", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={pid("style")}>Style / trim</Label>
            <Input
              id={pid("style")}
              placeholder="se"
              value={form.style}
              onChange={(e) => updateField("style", e.target.value)}
            />
          </div>
          {catalogDown ? (
            <p className="text-xs text-muted-foreground">
              Live vehicle catalog isn&rsquo;t connected — enter year/make/model/style as text.
            </p>
          ) : (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setManualVehicleEntry(false)}
            >
              Back to dropdowns
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={pid("price")}>Price</Label>
          <Input
            id={pid("price")}
            inputMode="numeric"
            required
            placeholder="15000"
            value={form.price}
            onChange={(e) => updateField("price", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={pid("mileage")}>Mileage (optional)</Label>
          <Input
            id={pid("mileage")}
            inputMode="numeric"
            placeholder="Leave blank if unknown"
            value={form.mileage}
            onChange={(e) => updateField("mileage", e.target.value)}
          />
          {mileageUnknown ? (
            <p className="text-xs text-muted-foreground">Mileage unknown — queue will show a badge until miles are added.</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={pid("assignedToUserId")}>Assign to closer (optional)</Label>
        <select
          id={pid("assignedToUserId")}
          className={selectClass}
          value={form.assignedToUserId}
          onChange={(e) => updateField("assignedToUserId", e.target.value)}
          disabled={usersQuery.isLoading}
        >
          <option value="">Unassigned</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName} ({user.role})
            </option>
          ))}
        </select>
        {usersQuery.data && !usersQuery.data.ok ? (
          <p className="text-xs text-muted-foreground">
            Could not load staff list — you can still submit unassigned.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={pid("submitterNotes")}>Your notes (optional)</Label>
        <textarea
          id={pid("submitterNotes")}
          className="min-h-20 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          placeholder="Why this one looks interesting, seller context, etc."
          value={form.submitterNotes}
          onChange={(e) => updateField("submitterNotes", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={pid("sellerNotes")}>Seller notes (optional)</Label>
        <textarea
          id={pid("sellerNotes")}
          className="min-h-16 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
          placeholder="Anything the seller mentioned in the post"
          value={form.sellerNotes}
          onChange={(e) => updateField("sellerNotes", e.target.value)}
        />
      </div>
        </>
      ) : null}

      {footer}
    </form>
  );
}
