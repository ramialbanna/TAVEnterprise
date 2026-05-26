"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { listAppUsers, submitManualOpportunity, type ManualSubmissionRequest } from "@/lib/app-api/client";
import { codeMessage } from "@/lib/app-api";
import { queryKeys } from "@/lib/query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  region: "dallas_tx",
  year: "",
  make: "",
  model: "",
  style: "",
  price: "",
  mileage: "",
  sellerNotes: "",
  submitterNotes: "",
};

const selectClass =
  "h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground " +
  "disabled:cursor-not-allowed disabled:opacity-50";

function parseOptionalInt(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) ? n : undefined;
}

function buildRequest(form: FormState): ManualSubmissionRequest | null {
  const listingUrl = form.listingUrl.trim();
  if (!listingUrl) return null;

  const body: ManualSubmissionRequest = { listingUrl };

  if (form.assignedToUserId) body.assignedToUserId = form.assignedToUserId;
  if (form.source) body.source = form.source as ManualSubmissionRequest["source"];
  if (form.region) body.region = form.region as ManualSubmissionRequest["region"];

  const year = parseOptionalInt(form.year);
  if (year !== undefined) body.year = year;
  if (form.make.trim()) body.make = form.make.trim();
  if (form.model.trim()) body.model = form.model.trim();
  if (form.style.trim()) body.style = form.style.trim();

  const price = parseOptionalInt(form.price);
  if (price !== undefined) body.price = price;
  const mileage = parseOptionalInt(form.mileage);
  if (mileage !== undefined) body.mileage = mileage;

  if (form.sellerNotes.trim()) body.sellerNotes = form.sellerNotes.trim();
  if (form.submitterNotes.trim()) body.submitterNotes = form.submitterNotes.trim();

  return body;
}

export function ManualSubmitDialog() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const usersQuery = useQuery({
    queryKey: queryKeys.appUsers,
    queryFn: listAppUsers,
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: submitManualOpportunity,
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(codeMessage(result.error));
        return;
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.opportunities() });

      const { data } = result;
      if (data.warnings.includes("listing_already_exists")) {
        toast.message("Listing already in the queue", {
          description: "Your submission was recorded, but this URL was seen before.",
        });
      } else {
        toast.success("Listing submitted");
      }

      setForm(EMPTY_FORM);
      setOpen(false);

      if (data.opportunity?.id) {
        router.push(`/opportunities/${data.opportunity.id}`);
      }
    },
  });

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const body = buildRequest(form);
    if (!body) {
      toast.error("Listing URL is required");
      return;
    }
    mutation.mutate(body);
  }

  const users = usersQuery.data?.ok ? usersQuery.data.data : [];
  const canSubmit = form.listingUrl.trim().length > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="mr-2 size-4" aria-hidden />
          Submit listing
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Submit a listing</DialogTitle>
          <DialogDescription>
            Paste a marketplace link and optional vehicle facts. The listing enters the same
            Opportunities queue as automated leads.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="listingUrl">Listing URL</Label>
            <Input
              id="listingUrl"
              name="listingUrl"
              type="url"
              required
              placeholder="https://www.facebook.com/marketplace/item/..."
              value={form.listingUrl}
              onChange={(e) => updateField("listingUrl", e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <select
                id="region"
                className={selectClass}
                value={form.region}
                onChange={(e) => updateField("region", e.target.value)}
              >
                {REGIONS.map((region) => (
                  <option key={region.value} value={region.value}>
                    {region.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <select
                id="source"
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
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                inputMode="numeric"
                placeholder="2020"
                value={form.year}
                onChange={(e) => updateField("year", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="make">Make</Label>
              <Input
                id="make"
                placeholder="toyota"
                value={form.make}
                onChange={(e) => updateField("make", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                placeholder="camry"
                value={form.model}
                onChange={(e) => updateField("model", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="style">Style / trim</Label>
              <Input
                id="style"
                placeholder="se"
                value={form.style}
                onChange={(e) => updateField("style", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                inputMode="numeric"
                placeholder="15000"
                value={form.price}
                onChange={(e) => updateField("price", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mileage">Mileage</Label>
              <Input
                id="mileage"
                inputMode="numeric"
                placeholder="50000"
                value={form.mileage}
                onChange={(e) => updateField("mileage", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assignedToUserId">Assign to closer (optional)</Label>
            <select
              id="assignedToUserId"
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
            <Label htmlFor="submitterNotes">Your notes (optional)</Label>
            <textarea
              id="submitterNotes"
              className="min-h-20 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              placeholder="Why this one looks interesting, seller context, etc."
              value={form.submitterNotes}
              onChange={(e) => updateField("submitterNotes", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sellerNotes">Seller notes (optional)</Label>
            <textarea
              id="sellerNotes"
              className="min-h-16 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              placeholder="Anything the seller mentioned in the post"
              value={form.sellerNotes}
              onChange={(e) => updateField("sellerNotes", e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending ? "Submitting…" : "Submit listing"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
