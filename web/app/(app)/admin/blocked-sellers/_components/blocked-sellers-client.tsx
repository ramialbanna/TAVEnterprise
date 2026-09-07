"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { listBlockedSellers, unblockBlockedSeller } from "@/lib/app-api/client";
import { codeMessage } from "@/lib/app-api";
import type { BlockedSellerReview } from "@/lib/app-api/schemas";
import { queryKeys } from "@/lib/query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ErrorState, UnavailableState } from "@/components/data-state";
import { cn } from "@/lib/utils";

type OriginFilter = "all" | "auto" | "buyer" | "one_listing";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function displayName(name: string | null): string {
  if (!name) return "Unknown seller";
  return name.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function BlockedSellersClient() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.blockedSellers,
    queryFn: listBlockedSellers,
  });

  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const unblock = useMutation({
    mutationFn: (id: string) => unblockBlockedSeller(id),
    onSuccess: (result, id) => {
      if (result.ok) {
        toast.success("Removed from the block list");
        setConfirmId(null);
        if (openId === id) setOpenId(null);
        void queryClient.invalidateQueries({ queryKey: queryKeys.blockedSellers });
        return;
      }
      toast.error(codeMessage(result.error));
    },
  });

  const filtered = useMemo(() => {
    const rows = query.data?.ok ? query.data.data : [];
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (origin === "auto" && row.origin !== "auto") return false;
      if (origin === "buyer" && row.origin !== "buyer") return false;
      if (origin === "one_listing" && row.listingCount !== 1) return false;
      if (!q) return true;
      return (
        (row.sellerName ?? "").includes(q) ||
        (row.sellerUrl ?? "").toLowerCase().includes(q)
      );
    });
  }, [query.data, search, origin]);

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">Loading blocked sellers…</p>;
  }

  if (query.data && !query.data.ok) {
    if (query.data.kind === "unavailable") {
      return <UnavailableState code={query.data.error} title="Blocked sellers unavailable" />;
    }
    return <ErrorState error={query.data} onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name or profile URL"
          className="sm:max-w-sm"
          aria-label="Search blocked sellers"
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter blocked sellers">
          {(
            [
              ["all", "All"],
              ["auto", "Auto"],
              ["buyer", "Buyer flagged"],
              ["one_listing", "One listing"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={origin === value ? "default" : "outline"}
              onClick={() => setOrigin(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length} seller{filtered.length === 1 ? "" : "s"}
        {origin === "one_listing" ? " with one car — start here" : ""}
      </p>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            No blocked sellers match this filter.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((row) => (
            <BlockedSellerCard
              key={row.id}
              row={row}
              open={openId === row.id}
              confirming={confirmId === row.id}
              busy={unblock.isPending && unblock.variables === row.id}
              onToggle={() => setOpenId((current) => (current === row.id ? null : row.id))}
              onAskRemove={() => setConfirmId(row.id)}
              onCancelRemove={() => setConfirmId(null)}
              onConfirmRemove={() => unblock.mutate(row.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function BlockedSellerCard({
  row,
  open,
  confirming,
  busy,
  onToggle,
  onAskRemove,
  onCancelRemove,
  onConfirmRemove,
}: {
  row: BlockedSellerReview;
  open: boolean;
  confirming: boolean;
  busy: boolean;
  onToggle: () => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
}) {
  return (
    <li>
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight">
                  {displayName(row.sellerName)}
                </h2>
                <Badge variant={row.origin === "auto" ? "review" : "secondary"}>
                  {row.origin === "auto" ? "Auto" : "Buyer"}
                </Badge>
                <Badge variant={row.listingCount <= 1 ? "outline" : "neutral"}>
                  {row.listingCount === 1 ? "1 listing" : `${row.listingCount} listings`}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Blocked {formatWhen(row.createdAt)} · {row.reason}
              </p>
              {row.sellerUrl ? (
                <a
                  href={row.sellerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Facebook profile
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">No profile URL — name only</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={onToggle}>
                {open ? "Hide cars" : "Show cars"}
              </Button>
              {confirming ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={onConfirmRemove}
                  >
                    {busy ? "Removing…" : "Confirm remove"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={onCancelRemove}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button type="button" size="sm" variant="ghost" onClick={onAskRemove}>
                  Remove from list
                </Button>
              )}
            </div>
          </div>

          {open ? <ListingList listings={row.listings} /> : null}
        </CardContent>
      </Card>
    </li>
  );
}

function ListingList({ listings }: { listings: BlockedSellerReview["listings"] }) {
  if (listings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No stored listings match this seller yet. Use the Facebook profile link above.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {listings.map((listing) => (
        <li
          key={listing.id}
          className={cn("flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between")}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{listing.title}</p>
            <p className="text-xs text-muted-foreground">
              {listing.price != null ? money.format(listing.price) : "No price"} · seen{" "}
              {formatWhen(listing.firstSeenAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {listing.listingUrl ? (
              <a
                href={listing.listingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                Marketplace
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
            {listing.opportunityHref ? (
              <Link
                href={`/opportunities/${listing.id}`}
                className="font-medium text-primary hover:underline"
              >
                Open in app
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
