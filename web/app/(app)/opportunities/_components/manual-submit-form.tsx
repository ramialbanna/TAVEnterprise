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

  const usersQuery = useQuery({
    queryKey: queryKeys.appUsers,
    queryFn: listAppUsers,
    enabled: options.loadUsers,
  });

  const parseMutation = useMutation({
    mutationFn: parseListingUrl,
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setForm((prev) => applyParsedFields(prev, result.data));
      setDetailsOpen(true);
      if (result.data.warnings.length > 0) {
        toast.message("Listing parsed with notes", {
          description: result.data.warnings.join(" · "),
        });
      } else {
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
    setForm((prev) => ({ ...prev, [key]: value }));
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
  canSubmit,
  mutation,
  parseMutation,
  footer,
}: ReturnType<typeof useManualSubmitForm> & {
  idPrefix?: string;
  footer: ReactNode;
}) {
  const pid = (name: string) => (idPrefix ? `${idPrefix}-${name}` : name);
  const parsing = parseMutation.isPending;

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

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={pid("style")}>Style / trim</Label>
          <Input
            id={pid("style")}
            placeholder="se"
            value={form.style}
            onChange={(e) => updateField("style", e.target.value)}
          />
        </div>
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
