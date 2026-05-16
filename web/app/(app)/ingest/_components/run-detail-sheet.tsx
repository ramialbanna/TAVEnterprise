"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { getIngestRun } from "@/lib/app-api/client";
import type { IngestRunSummary, IngestRunDetail } from "@/lib/app-api/schemas";
import { queryKeys } from "@/lib/query";
import { formatNumber, formatDateTime } from "@/lib/format";
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
