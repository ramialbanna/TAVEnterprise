"use client";

import type { ReactNode } from "react";

import type { HistoricalSale } from "@/lib/app-api/schemas";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Row-detail sheet for one `HistoricalSale`. Pure-presentational — receives the
 * row directly from the table's click handler; no extra fetch. Only documented
 * envelope fields are rendered; nothing is invented or fabricated. Every value
 * routes through the shared null-safe formatters (`formatMoney` / `formatDate` /
 * `formatDateTime`) so a missing field shows the em-dash sentinel, never `0` and
 * never blank.
 */
export function RowDetailSheet({
  sale,
  onClose,
}: {
  sale: HistoricalSale | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={sale !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent
        side="right"
        className="w-full max-w-md sm:max-w-md md:max-w-lg overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>
            {sale ? `${sale.year} ${sale.make} ${sale.model}${sale.trim ? ` ${sale.trim}` : ""}` : "Sale"}
          </SheetTitle>
          <SheetDescription>
            {sale?.id ? `Record ${sale.id}` : null}
          </SheetDescription>
        </SheetHeader>
        {sale ? <Body sale={sale} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Body({ sale }: { sale: HistoricalSale }) {
  return (
    <dl className="space-y-3 px-4 pb-4 text-sm">
      <Row label="Sale date">{formatDate(sale.saleDate)}</Row>
      <Row label="Acquired">{formatDate(sale.acquisitionDate)}</Row>
      <Row label="VIN">{sale.vin ?? "—"}</Row>
      <Row label="Year">{sale.year}</Row>
      <Row label="Make">{sale.make}</Row>
      <Row label="Model">{sale.model}</Row>
      <Row label="Trim">{sale.trim ?? "—"}</Row>
      <Row label="Acquisition cost">{formatMoney(sale.acquisitionCost)}</Row>
      <Row label="Sale price">{formatMoney(sale.salePrice)}</Row>
      <Row label="Transport cost">{formatMoney(sale.transportCost)}</Row>
      <Row label="Recon cost">{formatMoney(sale.reconCost)}</Row>
      <Row label="Auction fees">{formatMoney(sale.auctionFees)}</Row>
      <Row label="Gross profit">{formatMoney(sale.grossProfit)}</Row>
      <Row label="Buyer">{sale.buyer ?? "—"}</Row>
      <Row label="Buyer user">{sale.buyerUserId ?? "—"}</Row>
      <Row label="Source file">{sale.sourceFileName ?? "—"}</Row>
      <Row label="Upload batch">{sale.uploadBatchId ?? "—"}</Row>
      <Row label="Created">{formatDateTime(sale.createdAt)}</Row>
      <p className="pt-2 text-xs text-muted-foreground">
        More columns pending schema work.
      </p>
    </dl>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[max-content_1fr] items-start gap-x-3">
      <dt className="pt-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}
