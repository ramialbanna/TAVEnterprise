import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { DASH, MmrMoney } from "./mmr-value";
import type { MmrLowerSectionPhase } from "./mmr-lower-section-state";
import type { MmrTransaction } from "./mmr-market-types";

export const TX_COLUMNS = [
  "Date",
  "Price",
  "Odo (mi)",
  "Grade",
  "EVBH",
  "Eng/T",
  "Ext Color",
  "Type",
  "Region",
  "Auction",
] as const;

type Props = {
  phase: MmrLowerSectionPhase;
  transactions?: MmrTransaction[];
  className?: string;
};

function SectionTitle() {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">
      Transactions
    </h2>
  );
}

function IdleBody() {
  return (
    <Card className="mt-2 border-dashed bg-surface-sunken">
      <CardContent className="py-8 text-center text-sm text-muted-foreground">
        Search to load wholesale auction transaction comps for this vehicle.
      </CardContent>
    </Card>
  );
}

function LoadingBody() {
  return (
    <Card className="mt-2">
      <CardContent className="space-y-2 p-4">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

function cell(value: string | number | null | undefined, numeric = false) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{DASH}</span>;
  }
  if (numeric && typeof value === "number") {
    return <span className="tabular-nums">{value.toLocaleString()}</span>;
  }
  return <span>{value}</span>;
}

function TransactionRows({ rows }: { rows: MmrTransaction[] }) {
  return (
    <tbody>
      {rows.map((row, index) => (
        <tr key={`${row.date ?? "row"}-${index}`} className="border-t border-border">
          <td className="whitespace-nowrap px-3 py-2">{cell(row.date)}</td>
          <td className="whitespace-nowrap px-3 py-2 tabular-nums">
            <MmrMoney value={row.price} />
          </td>
          <td className="whitespace-nowrap px-3 py-2 tabular-nums">{cell(row.odometer, true)}</td>
          <td className="whitespace-nowrap px-3 py-2">{cell(row.grade)}</td>
          <td className="whitespace-nowrap px-3 py-2 tabular-nums">{cell(row.evbh, true)}</td>
          <td className="whitespace-nowrap px-3 py-2">{cell(row.engineTrans)}</td>
          <td className="whitespace-nowrap px-3 py-2">{cell(row.exteriorColor)}</td>
          <td className="whitespace-nowrap px-3 py-2">{cell(row.type)}</td>
          <td className="whitespace-nowrap px-3 py-2">{cell(row.region)}</td>
          <td className="whitespace-nowrap px-3 py-2">{cell(row.auction)}</td>
        </tr>
      ))}
    </tbody>
  );
}

function ReadyBody({ transactions }: { transactions: MmrTransaction[] }) {
  const hasRows = transactions.length > 0;

  return (
    <Card className="mt-2">
      <CardContent className="p-0">
        <p className="px-4 py-2 text-xs text-muted-foreground sm:hidden">
          Swipe horizontally to see all transaction columns.
        </p>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="min-w-[56rem] w-full text-sm">
            <thead className="bg-surface-sunken text-muted-foreground">
              <tr>
                {TX_COLUMNS.map((c) => (
                  <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            {hasRows ? (
              <TransactionRows rows={transactions} />
            ) : (
              <tbody>
                <tr className="border-t border-border">
                  <td
                    colSpan={TX_COLUMNS.length}
                    className="px-3 py-6 text-center text-sm text-muted-foreground"
                  >
                    No wholesale auction comps returned for this lookup. Cox may omit per-sale
                    rows even when historical averages are present.
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/** Zone C2 — Cox-style wholesale transaction comps table. */
export function TransactionsTable({ phase, transactions = [], className }: Props) {
  return (
    <section className={cn("min-w-0 px-4 sm:px-6", className)} aria-busy={phase === "loading"}>
      <SectionTitle />
      {phase === "idle" ? <IdleBody /> : null}
      {phase === "loading" ? <LoadingBody /> : null}
      {phase === "ready" ? <ReadyBody transactions={transactions} /> : null}
    </section>
  );
}
