"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { getIngestRun } from "@/lib/app-api/client";
import type {
  IngestRunSummary,
  IngestRunDetail,
  ListingDiagnostic,
} from "@/lib/app-api/schemas";
import { queryKeys } from "@/lib/query";
import { formatNumber, formatMoney, formatDateTime } from "@/lib/format";
import { ErrorState, UnavailableState } from "@/components/data-state";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Detail drawer for one source run. Fetches `getIngestRun(run.id)` only while
 * open (the list row carries the summary; the diagnostics are a separate read).
 * Real values only — null counts render the em-dash sentinel. `dead_letters`
 * has no per-run linkage in the current schema, so it is reported as
 * unavailable rather than fabricated.
 */
export function RunDetailSheet({
  run,
  onClose,
}: {
  run: IngestRunSummary | null;
  onClose: () => void;
}) {
  const open = run !== null;
  const query = useQuery({
    queryKey: run ? queryKeys.ingestRun(run.id) : ["ingest-run", "none"],
    queryFn: () => getIngestRun(run!.id),
    enabled: open,
  });

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <SheetContent
        side="right"
        className="w-full max-w-md sm:max-w-md md:max-w-xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>
            {run ? `${run.source} · ${run.region}` : "Run"}
          </SheetTitle>
          <SheetDescription>{run ? `Run ${run.run_id}` : null}</SheetDescription>
        </SheetHeader>
        {run ? (
          <div className="space-y-5 px-4 pb-6 text-sm">
            <Summary run={run} />
            {query.data === undefined ? (
              <p className="text-sm text-muted-foreground">Loading run detail…</p>
            ) : !query.data.ok ? (
              query.data.kind === "unavailable" ? (
                <UnavailableState code={query.data.error} title="Run detail unavailable" />
              ) : (
                <ErrorState error={query.data} onRetry={() => void query.refetch()} />
              )
            ) : (
              <Diagnostics detail={query.data.data} />
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Summary({ run }: { run: IngestRunSummary }) {
  return (
    <section className="space-y-3">
      <SectionTitle>Latest run</SectionTitle>
      <dl className="space-y-2">
        <Row label="Status">{run.status}</Row>
        <Row label="Items">{formatNumber(run.item_count)}</Row>
        <Row label="Processed listings">{formatNumber(run.processed)}</Row>
        <Row label="Rejected listings">{formatNumber(run.rejected)}</Row>
        <Row label="Created leads">{formatNumber(run.created_leads)}</Row>
        <Row label="Scraped at">{formatDateTime(run.scraped_at)}</Row>
        <Row label="Created at">{formatDateTime(run.created_at)}</Row>
        <Row label="Error">{run.error_message ?? "—"}</Row>
      </dl>
    </section>
  );
}

function Diagnostics({ detail }: { detail: IngestRunDetail }) {
  return (
    <>
      <section className="space-y-2">
        <SectionTitle>Listings</SectionTitle>
        <dl className="space-y-2">
          <Row label="Raw listing count">{formatNumber(detail.rawListingCount)}</Row>
          <Row label="Normalized listing count">
            {formatNumber(detail.normalizedListingCount)}
          </Row>
        </dl>
      </section>

      <CountSection title="Filtered-out reasons" counts={detail.filteredOutByReason} />
      <CountSection title="Valuation misses" counts={detail.valuationMissByReason} />
      <CountSection title="Schema drift" counts={detail.schemaDriftByType} />

      <section className="space-y-2">
        <SectionTitle>Created leads</SectionTitle>
        <p className="tabular-nums">{formatNumber(detail.createdLeadCount)}</p>
        {detail.createdLeadIds.length > 0 ? (
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {detail.createdLeadIds.map((id) => (
              <li key={id} className="font-mono">
                {id}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No leads created by this run.</p>
        )}
      </section>

      <ListingsTable listings={detail.listings} />

      <section className="space-y-1">
        <SectionTitle>Dead letters</SectionTitle>
        <p className="text-xs text-muted-foreground">
          Per-run dead letters are unavailable until the schema adds{" "}
          <code>source_run_id</code> to <code>tav.dead_letters</code>.
        </p>
      </section>
    </>
  );
}

function ListingsTable({ listings }: { listings: ListingDiagnostic[] }) {
  return (
    <section className="space-y-2">
      <SectionTitle>Listings ({formatNumber(listings.length)})</SectionTitle>
      {listings.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No normalized listings recorded for this run.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium">Listing</th>
                <th className="px-2 py-1.5 font-medium">Price</th>
                <th className="px-2 py-1.5 font-medium">Valuation</th>
                <th className="px-2 py-1.5 font-medium">Lead</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.normalized_listing_id} className="border-t border-border align-top">
                  <td className="px-2 py-1.5">
                    <ListingCell listing={l} />
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{formatMoney(l.price)}</td>
                  <td className="px-2 py-1.5">
                    <ValuationCell listing={l} />
                  </td>
                  <td className="px-2 py-1.5">
                    <LeadCell listing={l} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ListingCell({ listing }: { listing: ListingDiagnostic }) {
  const ymm = [listing.year, listing.make, listing.model, listing.trim]
    .filter((x) => x !== null && x !== "")
    .join(" ");
  const label = listing.title ?? (ymm || listing.normalized_listing_id);
  return (
    <div className="space-y-0.5">
      {listing.listing_url ? (
        <a
          href={listing.listing_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2"
        >
          {label}
        </a>
      ) : (
        <span>{label}</span>
      )}
      <div className="text-muted-foreground">
        {ymm || "—"} · VIN {listing.vin ?? "—"} ·{" "}
        {listing.mileage !== null ? `${formatNumber(listing.mileage)} mi` : "— mi"}
      </div>
    </div>
  );
}

function ValuationCell({ listing }: { listing: ListingDiagnostic }) {
  if (listing.valuation_status === "hit") {
    return <span className="text-foreground">hit · {formatMoney(listing.mmr_value)}</span>;
  }
  if (listing.valuation_status === "miss") {
    return (
      <span className="text-muted-foreground">
        miss · {listing.valuation_missing_reason ?? "—"}
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

function LeadCell({ listing }: { listing: ListingDiagnostic }) {
  if (!listing.lead_id) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="text-foreground">
      {listing.lead_grade ?? "—"}
      {listing.lead_final_score !== null ? ` · ${formatNumber(listing.lead_final_score)}` : ""}
    </span>
  );
}

function CountSection({
  title,
  counts,
}: {
  title: string;
  counts: Record<string, number>;
}) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <section className="space-y-2">
      <SectionTitle>{title}</SectionTitle>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">None.</p>
      ) : (
        <dl className="space-y-1.5">
          {entries.map(([reason, count]) => (
            <Row key={reason} label={reason}>
              {formatNumber(count)}
            </Row>
          ))}
        </dl>
      )}
    </section>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[max-content_1fr] items-start gap-x-3">
      <dt className="pt-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="tabular-nums break-all">{children}</dd>
    </div>
  );
}
