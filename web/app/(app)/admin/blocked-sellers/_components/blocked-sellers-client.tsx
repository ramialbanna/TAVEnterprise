"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Search } from "lucide-react";
import { toast } from "sonner";

import { listBlockedSellers, unblockBlockedSeller } from "@/lib/app-api/client";
import { codeMessage } from "@/lib/app-api";
import type { BlockedSellerReview } from "@/lib/app-api/schemas";
import { queryKeys } from "@/lib/query";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, UnavailableState } from "@/components/data-state";
import { cn } from "@/lib/utils";

import {
  applyBlockedSellerQuery,
  countBlockedSellerOrigins,
  DEFAULT_QUERY,
  displaySellerName,
  queryIsFiltered,
  SORT_OPTIONS,
  type BlockedSellerQuery,
  type ListingsFilter,
  type OriginFilter,
  type ProfileFilter,
  type SortDir,
  type SortKey,
} from "./blocked-sellers-query";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function parseSortValue(value: string): { sortKey: SortKey; sortDir: SortDir } {
  const [sortKey, sortDir] = value.split(":") as [SortKey, SortDir];
  return { sortKey, sortDir };
}

export function BlockedSellersClient() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.blockedSellers,
    queryFn: listBlockedSellers,
  });

  const [filters, setFilters] = useState<BlockedSellerQuery>(DEFAULT_QUERY);
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

  const rows = query.data?.ok ? query.data.data : [];
  const filtered = useMemo(() => applyBlockedSellerQuery(rows, filters), [rows, filters]);
  const originCounts = useMemo(() => countBlockedSellerOrigins(rows), [rows]);
  const filteredActive = queryIsFiltered(filters);

  function update(partial: Partial<BlockedSellerQuery>) {
    setFilters((current) => ({ ...current, ...partial }));
  }

  function toggleSort(key: SortKey) {
    setFilters((current) => {
      if (current.sortKey === key) {
        return { ...current, sortDir: current.sortDir === "asc" ? "desc" : "asc" };
      }
      return { ...current, sortKey: key, sortDir: key === "sellerName" ? "asc" : "desc" };
    });
  }

  if (query.isPending) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading blocked sellers">
        <Skeleton className="h-9 w-full sm:w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.data && !query.data.ok) {
    if (query.data.kind === "unavailable") {
      return <UnavailableState code={query.data.error} title="Blocked sellers unavailable" />;
    }
    return <ErrorState error={query.data} onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:p-4">
        <div className="relative sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={filters.search}
            onChange={(event) => update({ search: event.target.value })}
            placeholder="Search name, URL, or listing"
            className="pl-8"
            aria-label="Search blocked sellers"
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect
            id="blocked-origin"
            label="Origin"
            value={filters.origin}
            onChange={(value) => update({ origin: value as OriginFilter })}
            options={[
              { value: "all", label: `All (${originCounts.all})` },
              { value: "auto", label: `Auto (${originCounts.auto})` },
              { value: "buyer", label: `Buyer (${originCounts.buyer})` },
            ]}
          />
          <FilterSelect
            id="blocked-listings"
            label="Listings"
            value={filters.listings}
            onChange={(value) => update({ listings: value as ListingsFilter })}
            options={[
              { value: "all", label: "Any count" },
              { value: "one", label: "One listing" },
              { value: "many", label: "Multiple" },
            ]}
          />
          <FilterSelect
            id="blocked-profile"
            label="Profile"
            value={filters.profile}
            onChange={(value) => update({ profile: value as ProfileFilter })}
            options={[
              { value: "all", label: "Any" },
              { value: "has_url", label: "Has Facebook URL" },
              { value: "name_only", label: "Name only" },
            ]}
          />
          <FilterSelect
            id="blocked-sort"
            label="Sort"
            value={`${filters.sortKey}:${filters.sortDir}`}
            onChange={(value) => update(parseSortValue(value))}
            options={SORT_OPTIONS.map((option) => ({
              value: `${option.key}:${option.dir}`,
              label: option.label,
            }))}
          />
          {filteredActive ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => setFilters(DEFAULT_QUERY)}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length === rows.length
          ? `${filtered.length} seller${filtered.length === 1 ? "" : "s"}`
          : `${filtered.length} of ${rows.length} sellers`}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          No blocked sellers match this filter.
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] caption-bottom text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border">
                <SortableHeader
                  label="Seller"
                  sortKey="sellerName"
                  currentKey={filters.sortKey}
                  currentDir={filters.sortDir}
                  onSort={toggleSort}
                />
                <th scope="col" className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                  Origin
                </th>
                <SortableHeader
                  label="Listings"
                  sortKey="listingCount"
                  currentKey={filters.sortKey}
                  currentDir={filters.sortDir}
                  onSort={toggleSort}
                  align="right"
                />
                <SortableHeader
                  label="Blocked"
                  sortKey="createdAt"
                  currentKey={filters.sortKey}
                  currentDir={filters.sortDir}
                  onSort={toggleSort}
                />
                <th scope="col" className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                  Profile
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <BlockedSellerRow
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
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <select
        id={id}
        className={selectClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = currentKey === sortKey;
  const Icon = !active ? ArrowUpDown : currentDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      className={cn("px-3 py-2.5 font-medium text-muted-foreground", align === "right" && "text-right")}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}`}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          align === "right" && "flex-row-reverse",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className={cn("size-3.5", active ? "text-foreground" : "opacity-50")} aria-hidden />
      </button>
    </th>
  );
}

function BlockedSellerRow({
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
    <>
      <tr className="border-b border-border last:border-0 hover:bg-muted/40">
        <td className="px-3 py-2.5 align-top">
          <div className="min-w-0">
            <p className="font-medium">{displaySellerName(row.sellerName)}</p>
            <p className="text-xs text-muted-foreground">{row.reason}</p>
          </div>
        </td>
        <td className="px-3 py-2.5 align-top">
          <Badge variant={row.origin === "auto" ? "review" : "secondary"}>
            {row.origin === "auto" ? "Auto" : "Buyer"}
          </Badge>
        </td>
        <td className="px-3 py-2.5 text-right align-top tabular-nums">
          {row.listingCount}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 align-top text-muted-foreground">
          {formatDate(row.createdAt, { month: "short", day: "numeric", year: "numeric" })}
        </td>
        <td className="px-3 py-2.5 align-top">
          {row.sellerUrl ? (
            <a
              href={row.sellerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Facebook
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : (
            <span className="text-muted-foreground">Name only</span>
          )}
        </td>
        <td className="px-3 py-2.5 align-top">
          <div className="flex flex-wrap justify-end gap-2">
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
                Remove
              </Button>
            )}
          </div>
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={6} className="px-3 py-3">
            <ListingList listings={row.listings} />
          </td>
        </tr>
      ) : null}
    </>
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
    <ul className="divide-y divide-border rounded-md border border-border bg-card">
      {listings.map((listing) => (
        <li
          key={listing.id}
          className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{listing.title}</p>
            <p className="text-xs text-muted-foreground">
              {listing.price != null ? money.format(listing.price) : "No price"} · seen{" "}
              {formatDate(listing.firstSeenAt, { month: "short", day: "numeric", year: "numeric" })}
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
